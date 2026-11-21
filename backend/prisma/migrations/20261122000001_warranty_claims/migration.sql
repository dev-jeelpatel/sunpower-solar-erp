-- Warranty claims: a formal request to repair or replace a faulty unit under warranty.
-- Flow: filed -> inspecting -> inspected -> approved | rejected -> fulfilled -> closed (or withdrawn)

CREATE SEQUENCE claim_seq;

CREATE TYPE claim_status AS ENUM ('filed', 'inspecting', 'inspected', 'approved', 'rejected', 'fulfilled', 'closed', 'withdrawn');
CREATE TYPE claim_cause AS ENUM ('manufacturing_defect', 'installation_fault', 'wear_and_tear', 'physical_damage', 'misuse', 'power_surge', 'other');
CREATE TYPE claim_remedy AS ENUM ('repair', 'replace');
CREATE TYPE claim_recommendation AS ENUM ('repair', 'replace', 'no_fault');
CREATE TYPE rma_status AS ENUM ('none', 'pending', 'sent', 'credited');

CREATE TABLE warranty_claims (
  id                    SERIAL PRIMARY KEY,
  claim_no              VARCHAR(20) NOT NULL UNIQUE
                        DEFAULT ('WC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('claim_seq')::text, 4, '0')),
  customer_id           INT NOT NULL REFERENCES customers(id),
  unit_id               INT NOT NULL REFERENCES inventory_units(id),
  ticket_id             INT REFERENCES tickets(id),
  status                claim_status NOT NULL DEFAULT 'filed',

  -- filing
  issue                 TEXT NOT NULL,
  fault_code            VARCHAR(30),
  covered               BOOLEAN NOT NULL,            -- was the warranty valid on the day it was filed
  warranty_end          DATE,
  filed_by              INT REFERENCES users(id),
  filed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- inspection
  technician_id         INT REFERENCES users(id),
  inspection_date       DATE,
  findings              TEXT,
  cause                 claim_cause,
  recommendation        claim_recommendation,
  inspected_at          TIMESTAMPTZ,

  -- decision
  decided_by            INT REFERENCES users(id),
  decided_at            TIMESTAMPTZ,
  decision_notes        TEXT,
  goodwill              BOOLEAN NOT NULL DEFAULT FALSE,   -- approved although the warranty had ended (admin only)
  remedy                claim_remedy,

  -- fulfilment
  replacement_unit_id   INT REFERENCES inventory_units(id),
  repair_cost           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (repair_cost >= 0),
  fulfilled_by          INT REFERENCES users(id),
  fulfilled_at          TIMESTAMPTZ,
  fulfilment_notes      TEXT,

  -- faulty unit returned to the supplier for credit
  rma                   rma_status NOT NULL DEFAULT 'none',
  rma_reference         VARCHAR(60),
  supplier_credit       NUMERIC(12,2) CHECK (supplier_credit IS NULL OR supplier_credit >= 0),

  customer_confirmed_at TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (status NOT IN ('approved', 'fulfilled') OR remedy IS NOT NULL),
  CHECK (status <> 'rejected' OR decision_notes IS NOT NULL)
);

-- A unit can have only one live claim at a time
CREATE UNIQUE INDEX one_open_claim_per_unit ON warranty_claims (unit_id) WHERE status NOT IN ('rejected', 'closed', 'withdrawn');
CREATE INDEX claims_status_idx ON warranty_claims (status);
CREATE INDEX claims_customer_idx ON warranty_claims (customer_id);
CREATE INDEX claims_technician_idx ON warranty_claims (technician_id);

CREATE TRIGGER claims_updated BEFORE UPDATE ON warranty_claims FOR EACH ROW EXECUTE FUNCTION set_updated_at();
