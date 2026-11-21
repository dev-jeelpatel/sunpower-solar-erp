-- =====================================================================
-- Business rules enforced INSIDE the database + reporting views
-- =====================================================================

-- ---------- generic updated_at ----------
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated     BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER enquiries_updated BEFORE UPDATE ON enquiries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER subsidy_updated   BEFORE UPDATE ON subsidy_applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- Rule: no quote before the site survey is approved ----------
CREATE FUNCTION enforce_survey_before_quote() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM surveys WHERE enquiry_id = NEW.enquiry_id AND status = 'approved') THEN
    RAISE EXCEPTION 'A quote can only be issued after the site survey is approved';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER quotes_need_survey BEFORE INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION enforce_survey_before_quote();

-- ---------- Rule: stock can never go negative (serialised per product) ----------
CREATE FUNCTION enforce_non_negative_stock() RETURNS trigger AS $$
DECLARE on_hand BIGINT;
BEGIN
  IF NEW.qty < 0 THEN
    PERFORM pg_advisory_xact_lock(NEW.product_id);
    SELECT COALESCE(SUM(qty),0) INTO on_hand FROM stock_movements WHERE product_id = NEW.product_id;
    IF on_hand + NEW.qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product %: % on hand, % requested',
        (SELECT sku FROM products WHERE id = NEW.product_id), on_hand, -NEW.qty;
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER stock_non_negative BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION enforce_non_negative_stock();

-- ---------- Rule: delivery starts the warranty clock for every serial ----------
CREATE FUNCTION start_warranty_on_delivery() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    IF NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
    UPDATE inventory_units u
       SET status         = 'delivered',
           warranty_start = NEW.delivered_at::date,
           warranty_end   = (NEW.delivered_at::date + make_interval(months => p.warranty_months))::date
      FROM products p
     WHERE u.product_id = p.id AND u.dispatch_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER dispatch_starts_warranty BEFORE UPDATE ON dispatches
  FOR EACH ROW EXECUTE FUNCTION start_warranty_on_delivery();

-- ---------- Rule: a serial can only be dispatched once ----------
CREATE FUNCTION guard_unit_status() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('dispatched','delivered') AND NEW.status = 'in_stock' AND OLD.status = 'delivered' THEN
    RAISE EXCEPTION 'Unit % was already delivered and cannot return to stock', OLD.serial_no;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER units_status_guard BEFORE UPDATE ON inventory_units
  FOR EACH ROW EXECUTE FUNCTION guard_unit_status();

-- =====================================================================
-- Views
-- =====================================================================

-- Current stock per product
CREATE VIEW v_stock AS
SELECT p.id AS product_id, p.sku, p.name, p.category, p.tracked_serial, p.reorder_level, p.warranty_months,
       p.cost_price, p.sell_price, p.active,
       COALESCE(SUM(m.qty),0)::INT AS on_hand
  FROM products p
  LEFT JOIN stock_movements m ON m.product_id = p.id
 GROUP BY p.id;

-- Labour hours/cost per installation job
CREATE VIEW v_job_labour AS
SELECT j.id AS job_id, j.order_id,
       COALESCE(ROUND(EXTRACT(EPOCH FROM (j.finished_at - j.started_at)) / 3600.0, 2), 0) AS hours,
       COALESCE(SUM(u.hourly_rate),0) AS crew_rate_per_hour,
       COALESCE(ROUND(EXTRACT(EPOCH FROM (j.finished_at - j.started_at)) / 3600.0 * SUM(u.hourly_rate), 2), 0) AS labour_cost
  FROM installation_jobs j
  LEFT JOIN job_crew c ON c.job_id = j.id
  LEFT JOIN users u ON u.id = c.user_id
 GROUP BY j.id;

-- Profitability of every order: revenue - materials - technician labour
CREATE VIEW v_job_profitability AS
SELECT o.id AS order_id, o.order_no, o.status AS order_status, o.completed_at,
       c.id AS customer_id, c.name AS customer_name,
       o.total AS revenue,
       COALESCE(pay.paid,0)                  AS cash_received,
       COALESCE(mat.cost,0)                  AS material_cost,
       COALESCE(l.labour_cost,0)             AS labour_cost,
       COALESCE(l.hours,0)                   AS labour_hours,
       o.total - COALESCE(mat.cost,0) - COALESCE(l.labour_cost,0) AS profit,
       ROUND((o.total - COALESCE(mat.cost,0) - COALESCE(l.labour_cost,0)) / NULLIF(o.total,0) * 100, 1) AS margin_pct
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  LEFT JOIN LATERAL (SELECT SUM(oi.quantity * oi.unit_cost) AS cost FROM order_items oi WHERE oi.order_id = o.id) mat ON TRUE
  LEFT JOIN v_job_labour l ON l.order_id = o.id
  LEFT JOIN LATERAL (SELECT SUM(p.amount) AS paid FROM invoices i JOIN payments p ON p.invoice_id = i.id WHERE i.order_id = o.id) pay ON TRUE
 WHERE o.status <> 'cancelled';

-- What is still unfinished on each open order (the director's question)
CREATE VIEW v_order_pipeline AS
SELECT o.id AS order_id, o.order_no, c.name AS customer_name, o.status AS order_status, o.total,
       COALESCE(pay.paid,0) AS paid, o.total - COALESCE(pay.paid,0) AS balance,
       d.status AS dispatch_status, j.status AS job_status, j.scheduled_date,
       s.status AS subsidy_status,
       CASE
         WHEN o.status = 'pending_payment'        THEN 'Awaiting advance payment'
         WHEN d.status IN ('pending','packing')   THEN 'Warehouse: pack & dispatch'
         WHEN d.status = 'dispatched'             THEN 'Delivery to be confirmed'
         WHEN j.status IN ('unscheduled','scheduled') THEN 'Installation pending'
         WHEN o.total - COALESCE(pay.paid,0) > 0  THEN 'Balance payment due'
         WHEN s.status IN ('documents_pending','submitted') THEN 'Subsidy paperwork open'
         ELSE 'Complete'
       END AS next_step
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  LEFT JOIN dispatches d ON d.order_id = o.id
  LEFT JOIN installation_jobs j ON j.order_id = o.id
  LEFT JOIN subsidy_applications s ON s.order_id = o.id
  LEFT JOIN LATERAL (SELECT SUM(p.amount) AS paid FROM invoices i JOIN payments p ON p.invoice_id = i.id WHERE i.order_id = o.id) pay ON TRUE
 WHERE o.status <> 'cancelled';
