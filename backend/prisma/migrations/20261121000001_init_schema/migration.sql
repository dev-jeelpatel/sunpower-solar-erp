-- =====================================================================
-- SunPower Solar ERP - core schema (PostgreSQL)
-- Normalised to 3NF. Money = NUMERIC(12,2). All FKs indexed.
-- =====================================================================

-- ---------- Enumerated types ----------
CREATE TYPE user_role        AS ENUM ('admin','sales','technician','warehouse','support','director');
CREATE TYPE enquiry_source   AS ENUM ('web','whatsapp','call','walk_in');
CREATE TYPE enquiry_status   AS ENUM ('new','contacted','qualified','survey_scheduled','survey_approved','quoted','won','lost');
CREATE TYPE system_type      AS ENUM ('on_grid','off_grid');
CREATE TYPE survey_status    AS ENUM ('scheduled','completed','approved','rejected');
CREATE TYPE product_category AS ENUM ('panel','inverter','battery','charge_controller','wiring_box','switch','earthing','stand','cable','connector','service');
CREATE TYPE package_kind     AS ENUM ('hardware','on_grid','off_grid','service');
CREATE TYPE quote_status     AS ENUM ('draft','sent','accepted','rejected','expired');
CREATE TYPE order_status     AS ENUM ('pending_payment','confirmed','dispatched','delivered','completed','cancelled');
CREATE TYPE invoice_kind     AS ENUM ('order','service');
CREATE TYPE invoice_status   AS ENUM ('sent','partially_paid','paid','void');
CREATE TYPE payment_method   AS ENUM ('cash','upi','bank_transfer','cheque','card');
CREATE TYPE unit_status      AS ENUM ('in_stock','dispatched','delivered','faulty');
CREATE TYPE movement_reason  AS ENUM ('purchase','dispatch','dispatch_reversal','service_part','adjustment');
CREATE TYPE po_status        AS ENUM ('ordered','received','cancelled');
CREATE TYPE dispatch_status  AS ENUM ('pending','packing','dispatched','delivered');
CREATE TYPE job_status       AS ENUM ('unscheduled','scheduled','completed');
CREATE TYPE ticket_status    AS ENUM ('open','assigned','resolved','closed');
CREATE TYPE ticket_priority  AS ENUM ('low','normal','high','urgent');
CREATE TYPE warranty_state   AS ENUM ('in_warranty','out_of_warranty','unknown');
CREATE TYPE subsidy_status   AS ENUM ('documents_pending','submitted','approved','disbursed','rejected');
CREATE TYPE payout_status    AS ENUM ('pending','paid');

-- ---------- Human-friendly document numbers ----------
CREATE SEQUENCE quote_seq;
CREATE SEQUENCE order_seq;
CREATE SEQUENCE invoice_seq;
CREATE SEQUENCE ticket_seq;
CREATE SEQUENCE po_seq;

-- ---------- Users / staff ----------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash TEXT         NOT NULL,
  role          user_role    NOT NULL,
  phone         VARCHAR(15),
  hourly_rate   NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

-- ---------- Customers ----------
CREATE TABLE customers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(15)  NOT NULL UNIQUE,
  email      VARCHAR(150),
  address    TEXT         NOT NULL,
  city       VARCHAR(80),
  pincode    VARCHAR(6),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- Sales pipeline: enquiries + surveys ----------
CREATE TABLE enquiries (
  id                  SERIAL PRIMARY KEY,
  customer_name       VARCHAR(120)    NOT NULL,
  phone               VARCHAR(15)     NOT NULL,
  email               VARCHAR(150),
  address             TEXT            NOT NULL,
  city                VARCHAR(80),
  requested_kw        NUMERIC(3,1)    NOT NULL CHECK (requested_kw BETWEEN 1 AND 5),
  system_type         system_type     NOT NULL,
  subsidy_required    BOOLEAN         NOT NULL DEFAULT FALSE,
  message             TEXT,
  source              enquiry_source  NOT NULL DEFAULT 'web',
  status              enquiry_status  NOT NULL DEFAULT 'new',
  assigned_to         INT REFERENCES users(id),
  customer_id         INT REFERENCES customers(id),
  -- telephonic qualification checklist
  shadow_free_sqft    NUMERIC(8,1) CHECK (shadow_free_sqft > 0),
  monthly_bill        NUMERIC(10,2) CHECK (monthly_bill >= 0),
  grid_suitable       BOOLEAN,
  qualification_notes TEXT,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX enquiries_status_idx   ON enquiries (status);
CREATE INDEX enquiries_assigned_idx ON enquiries (assigned_to);
CREATE INDEX enquiries_phone_idx    ON enquiries (phone);

CREATE TABLE surveys (
  id               SERIAL PRIMARY KEY,
  enquiry_id       INT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  technician_id    INT NOT NULL REFERENCES users(id),
  scheduled_date   DATE NOT NULL,
  status           survey_status NOT NULL DEFAULT 'scheduled',
  roof_direction   VARCHAR(2) CHECK (roof_direction IN ('N','NE','E','SE','S','SW','W','NW')),
  roof_tilt_deg    NUMERIC(4,1) CHECK (roof_tilt_deg BETWEEN 0 AND 90),
  cable_distance_m NUMERIC(6,1) CHECK (cable_distance_m >= 0),
  usable_area_sqft NUMERIC(8,1) CHECK (usable_area_sqft > 0),
  notes            TEXT,
  reviewed_by      INT REFERENCES users(id),
  review_notes     TEXT,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX surveys_enquiry_idx ON surveys (enquiry_id);
CREATE INDEX surveys_tech_idx    ON surveys (technician_id);

-- ---------- Catalogue ----------
CREATE TABLE products (
  id             SERIAL PRIMARY KEY,
  sku            VARCHAR(30)  NOT NULL UNIQUE,
  name           VARCHAR(150) NOT NULL,
  category       product_category NOT NULL,
  tracked_serial BOOLEAN      NOT NULL DEFAULT FALSE,
  warranty_months INT         NOT NULL DEFAULT 0 CHECK (warranty_months >= 0),
  cost_price     NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
  sell_price     NUMERIC(12,2) NOT NULL CHECK (sell_price >= 0),
  reorder_level  INT          NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (NOT tracked_serial OR category <> 'service')
);

CREATE TABLE packages (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL UNIQUE,
  kind        package_kind NOT NULL,
  capacity_kw NUMERIC(3,1) CHECK (capacity_kw BETWEEN 1 AND 5),
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (kind, capacity_kw)
);

-- Bill of materials: the "exact list of parts" for a package
CREATE TABLE package_items (
  package_id INT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity   INT NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (package_id, product_id)
);
CREATE INDEX package_items_product_idx ON package_items (product_id);

-- ---------- Quotes ----------
CREATE TABLE quotes (
  id          SERIAL PRIMARY KEY,
  quote_no    VARCHAR(20) NOT NULL UNIQUE
              DEFAULT ('Q-' || to_char(now(),'YYYY') || '-' || lpad(nextval('quote_seq')::text,4,'0')),
  enquiry_id  INT NOT NULL REFERENCES enquiries(id),
  package_id  INT NOT NULL REFERENCES packages(id),
  status      quote_status NOT NULL DEFAULT 'draft',
  subtotal    NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  discount    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax_percent NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
  tax_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total       NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  valid_until DATE NOT NULL,
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (discount <= subtotal)
);
CREATE INDEX quotes_enquiry_idx ON quotes (enquiry_id);
CREATE INDEX quotes_status_idx  ON quotes (status);

CREATE TABLE quote_items (
  id          SERIAL PRIMARY KEY,
  quote_id    INT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id  INT NOT NULL REFERENCES products(id),
  description VARCHAR(200) NOT NULL,
  quantity    INT NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost   NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  line_total  NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
CREATE INDEX quote_items_quote_idx ON quote_items (quote_id);

-- ---------- Orders / billing ----------
CREATE TABLE orders (
  id            SERIAL PRIMARY KEY,
  order_no      VARCHAR(20) NOT NULL UNIQUE
                DEFAULT ('SO-' || to_char(now(),'YYYY') || '-' || lpad(nextval('order_seq')::text,4,'0')),
  quote_id      INT NOT NULL UNIQUE REFERENCES quotes(id),
  customer_id   INT NOT NULL REFERENCES customers(id),
  status        order_status NOT NULL DEFAULT 'pending_payment',
  total         NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  confirmed_at  TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_idx ON orders (customer_id);
CREATE INDEX orders_status_idx   ON orders (status);

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity   INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  unit_cost  NUMERIC(12,2) NOT NULL,
  UNIQUE (order_id, product_id)
);

CREATE TABLE invoices (
  id          SERIAL PRIMARY KEY,
  invoice_no  VARCHAR(20) NOT NULL UNIQUE
              DEFAULT ('INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('invoice_seq')::text,4,'0')),
  kind        invoice_kind NOT NULL,
  order_id    INT REFERENCES orders(id),
  ticket_id   INT,                              -- FK added after tickets table
  customer_id INT NOT NULL REFERENCES customers(id),
  status      invoice_status NOT NULL DEFAULT 'sent',
  subtotal    NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  tax_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total       NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  issued_at   DATE NOT NULL DEFAULT current_date,
  due_date    DATE NOT NULL DEFAULT (current_date + 15),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'order' AND order_id IS NOT NULL) OR (kind = 'service' AND ticket_id IS NOT NULL))
);
CREATE INDEX invoices_order_idx    ON invoices (order_id);
CREATE INDEX invoices_customer_idx ON invoices (customer_id);
CREATE INDEX invoices_status_idx   ON invoices (status);

CREATE TABLE invoice_items (
  id          SERIAL PRIMARY KEY,
  invoice_id  INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description VARCHAR(200) NOT NULL,
  quantity    NUMERIC(8,2) NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(12,2) NOT NULL            -- negative allowed (discount lines)
);
CREATE INDEX invoice_items_invoice_idx ON invoice_items (invoice_id);

CREATE TABLE payments (
  id          SERIAL PRIMARY KEY,
  invoice_id  INT NOT NULL REFERENCES invoices(id),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method      payment_method NOT NULL,
  reference   VARCHAR(80),
  received_by INT REFERENCES users(id),
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_invoice_idx ON payments (invoice_id);
CREATE INDEX payments_paid_at_idx ON payments (paid_at);

-- ---------- Government subsidy paperwork ----------
CREATE TABLE subsidy_applications (
  id              SERIAL PRIMARY KEY,
  order_id        INT NOT NULL UNIQUE REFERENCES orders(id),
  scheme          VARCHAR(80) NOT NULL DEFAULT 'PM Surya Ghar: Muft Bijli Yojana',
  status          subsidy_status NOT NULL DEFAULT 'documents_pending',
  expected_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (expected_amount >= 0),
  approved_amount NUMERIC(12,2) CHECK (approved_amount >= 0),
  reference_no    VARCHAR(60),
  submitted_at    DATE,
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Warehouse ----------
CREATE TABLE suppliers (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(120) NOT NULL UNIQUE,
  phone VARCHAR(15),
  email VARCHAR(150)
);

CREATE TABLE purchase_orders (
  id          SERIAL PRIMARY KEY,
  po_no       VARCHAR(20) NOT NULL UNIQUE
              DEFAULT ('PO-' || to_char(now(),'YYYY') || '-' || lpad(nextval('po_seq')::text,4,'0')),
  supplier_id INT NOT NULL REFERENCES suppliers(id),
  status      po_status NOT NULL DEFAULT 'ordered',
  ordered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ,
  created_by  INT REFERENCES users(id)
);
CREATE TABLE purchase_order_items (
  id          SERIAL PRIMARY KEY,
  po_id       INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id  INT NOT NULL REFERENCES products(id),
  quantity    INT NOT NULL CHECK (quantity > 0),
  unit_cost   NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  UNIQUE (po_id, product_id)
);

-- Append-only stock ledger: on-hand = SUM(qty)
CREATE TABLE stock_movements (
  id         BIGSERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  qty        INT NOT NULL CHECK (qty <> 0),
  reason     movement_reason NOT NULL,
  ref_type   VARCHAR(20),
  ref_id     INT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product_idx ON stock_movements (product_id);

CREATE TABLE dispatches (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL UNIQUE REFERENCES orders(id),
  status        dispatch_status NOT NULL DEFAULT 'pending',
  vehicle_no    VARCHAR(20),
  dispatched_at TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dispatches_status_idx ON dispatches (status);

-- One row per serial-numbered unit: traceability + warranty clock
CREATE TABLE inventory_units (
  id             SERIAL PRIMARY KEY,
  product_id     INT NOT NULL REFERENCES products(id),
  serial_no      VARCHAR(40) NOT NULL UNIQUE,
  status         unit_status NOT NULL DEFAULT 'in_stock',
  po_id          INT REFERENCES purchase_orders(id),
  dispatch_id    INT REFERENCES dispatches(id),
  order_id       INT REFERENCES orders(id),
  customer_id    INT REFERENCES customers(id),
  warranty_start DATE,
  warranty_end   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (warranty_end IS NULL OR warranty_end >= warranty_start)
);
CREATE INDEX units_product_status_idx ON inventory_units (product_id, status);
CREATE INDEX units_customer_idx       ON inventory_units (customer_id);
CREATE INDEX units_dispatch_idx       ON inventory_units (dispatch_id);

-- ---------- Installation jobs ----------
CREATE TABLE installation_jobs (
  id               SERIAL PRIMARY KEY,
  order_id         INT NOT NULL UNIQUE REFERENCES orders(id),
  status           job_status NOT NULL DEFAULT 'unscheduled',
  scheduled_date   DATE,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  confirmed_kw     NUMERIC(3,1) CHECK (confirmed_kw BETWEEN 0.5 AND 10),
  notes            TEXT,
  signer_name      VARCHAR(100),
  signature_data   TEXT,
  signed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at > started_at),
  CHECK (status <> 'completed' OR (started_at IS NOT NULL AND finished_at IS NOT NULL AND signature_data IS NOT NULL))
);
CREATE INDEX jobs_status_idx ON installation_jobs (status, scheduled_date);

CREATE TABLE job_crew (
  job_id  INT NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  PRIMARY KEY (job_id, user_id)
);
CREATE INDEX job_crew_user_idx ON job_crew (user_id);

CREATE TABLE job_photos (
  id          SERIAL PRIMARY KEY,
  job_id      INT NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  file_path   VARCHAR(255) NOT NULL,
  caption     VARCHAR(150),
  uploaded_by INT REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_photos_job_idx ON job_photos (job_id);

-- ---------- After-sales service ----------
CREATE TABLE tickets (
  id                    SERIAL PRIMARY KEY,
  ticket_no             VARCHAR(20) NOT NULL UNIQUE
                        DEFAULT ('TK-' || to_char(now(),'YYYY') || '-' || lpad(nextval('ticket_seq')::text,4,'0')),
  customer_id           INT NOT NULL REFERENCES customers(id),
  unit_id               INT REFERENCES inventory_units(id),
  subject               VARCHAR(150) NOT NULL,
  description           TEXT,
  fault_code            VARCHAR(30),
  priority              ticket_priority NOT NULL DEFAULT 'normal',
  status                ticket_status   NOT NULL DEFAULT 'open',
  warranty_status       warranty_state  NOT NULL DEFAULT 'unknown',
  assigned_to           INT REFERENCES users(id),
  resolution            TEXT,
  replacement_unit_id   INT REFERENCES inventory_units(id),
  resolved_at           TIMESTAMPTZ,
  customer_confirmed_at TIMESTAMPTZ,
  created_by            INT REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tickets_status_idx   ON tickets (status);
CREATE INDEX tickets_customer_idx ON tickets (customer_id);
CREATE INDEX tickets_unit_idx     ON tickets (unit_id);
ALTER TABLE invoices ADD CONSTRAINT invoices_ticket_fk FOREIGN KEY (ticket_id) REFERENCES tickets(id);
CREATE INDEX invoices_ticket_idx ON invoices (ticket_id);

-- Parts and labour used on a ticket (billed only when out of warranty)
CREATE TABLE ticket_lines (
  id          SERIAL PRIMARY KEY,
  ticket_id   INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  product_id  INT REFERENCES products(id),
  description VARCHAR(200) NOT NULL,
  quantity    NUMERIC(8,2) NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  is_labour   BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX ticket_lines_ticket_idx ON ticket_lines (ticket_id);

-- ---------- Technician payroll ----------
CREATE TABLE technician_payouts (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id),
  period_month DATE NOT NULL,                       -- first day of month
  hours        NUMERIC(8,2) NOT NULL CHECK (hours >= 0),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status       payout_status NOT NULL DEFAULT 'pending',
  paid_at      TIMESTAMPTZ,
  UNIQUE (user_id, period_month)
);

-- ---------- Audit trail ----------
CREATE TABLE activity_log (
  id         BIGSERIAL PRIMARY KEY,
  entity     VARCHAR(30) NOT NULL,
  entity_id  INT NOT NULL,
  action     VARCHAR(60) NOT NULL,
  detail     JSONB,
  user_id    INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_entity_idx ON activity_log (entity, entity_id);
