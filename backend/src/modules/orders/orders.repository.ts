import { type Db, exec, prisma, q, q1, type Row } from '../../lib/prisma';

export const ordersRepository = {
  async list(f: { status: string | null; q: string | null; limit: number; offset: number }) {
    const params = [f.status, f.q ? `%${f.q}%` : null];
    const where = `($1::text IS NULL OR o.status::text = $1) AND ($2::text IS NULL OR c.name ILIKE $2 OR o.order_no ILIKE $2)`;
    const [items, total] = await Promise.all([
      q(
        prisma,
        `SELECT o.id, o.order_no, o.status, o.total, o.created_at, c.name AS customer_name,
                COALESCE((SELECT SUM(p.amount) FROM invoices i JOIN payments p ON p.invoice_id = i.id WHERE i.order_id = o.id),0) AS paid
           FROM orders o JOIN customers c ON c.id = o.customer_id WHERE ${where} ORDER BY o.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`,
        params,
      ),
      q1<{ n: number }>(prisma, `SELECT count(*) AS n FROM orders o JOIN customers c ON c.id = o.customer_id WHERE ${where}`, params),
    ]);
    return { items, total: total?.n ?? 0 };
  },

  findDetailed: (id: number) =>
    q1(
      prisma,
      `SELECT o.*, c.name AS customer_name, c.phone, c.email, c.address, c.city, q.quote_no, q.enquiry_id, pk.name AS package_name, pk.capacity_kw
         FROM orders o JOIN customers c ON c.id = o.customer_id JOIN quotes q ON q.id = o.quote_id JOIN packages pk ON pk.id = q.package_id
        WHERE o.id = $1`,
      [id],
    ),
  itemsOf: (id: number) =>
    q(prisma, 'SELECT oi.*, p.name, p.sku FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE order_id = $1 ORDER BY oi.id', [id]),
  invoiceOf: (id: number) =>
    q1(prisma, 'SELECT i.*, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id),0) AS paid FROM invoices i WHERE order_id = $1', [id]),
  paymentsOf: (invoiceId: number) =>
    q(prisma, 'SELECT p.*, u.name AS received_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE invoice_id = $1 ORDER BY paid_at', [invoiceId]),
  dispatchOf: (id: number) => q1(prisma, 'SELECT * FROM dispatches WHERE order_id = $1', [id]),
  jobOf: (id: number) =>
    q1(
      prisma,
      `SELECT j.id, j.status, j.scheduled_date, j.finished_at,
              (SELECT json_agg(u.name) FROM job_crew c JOIN users u ON u.id = c.user_id WHERE c.job_id = j.id) AS crew
         FROM installation_jobs j WHERE order_id = $1`,
      [id],
    ),
  subsidyOf: (id: number) => q1(prisma, 'SELECT * FROM subsidy_applications WHERE order_id = $1', [id]),

  // ---- quote -> order conversion ----
  lockQuoteWithEnquiry: (db: Db, quoteId: number) =>
    q1<Row>(
      db,
      `SELECT q.*, e.customer_name, e.phone, e.email, e.address, e.city, e.subsidy_required, pk.kind, pk.capacity_kw
         FROM quotes q JOIN enquiries e ON e.id = q.enquiry_id JOIN packages pk ON pk.id = q.package_id
        WHERE q.id = $1 FOR UPDATE OF q`,
      [quoteId],
    ),
  /** Customer record is created on first order (phone is the natural key). */
  upsertCustomer: (db: Db, c: Row) =>
    q1<{ id: number }>(
      db,
      `INSERT INTO customers (name, phone, email, address, city) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, customers.email), address = EXCLUDED.address
       RETURNING id`,
      [c.customer_name, c.phone, c.email, c.address, c.city],
    ),
  acceptQuote: (db: Db, quoteId: number) => exec(db, `UPDATE quotes SET status = 'accepted' WHERE id = $1`, [quoteId]),
  winEnquiry: (db: Db, enquiryId: number, customerId: number) =>
    exec(db, `UPDATE enquiries SET status = 'won', customer_id = $2 WHERE id = $1`, [enquiryId, customerId]),
  rejectOtherQuotes: (db: Db, enquiryId: number, keepId: number) =>
    exec(db, `UPDATE quotes SET status = 'rejected' WHERE enquiry_id = $1 AND id <> $2 AND status IN ('draft','sent')`, [enquiryId, keepId]),
  insertOrder: (db: Db, quoteId: number, customerId: number, total: number) =>
    q1<Row>(db, 'INSERT INTO orders (quote_id, customer_id, total) VALUES ($1,$2,$3) RETURNING *', [quoteId, customerId, total]),
  copyQuoteItemsToOrder: (db: Db, orderId: number, quoteId: number) =>
    exec(
      db,
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost)
       SELECT $1, product_id, quantity, unit_price, unit_cost FROM quote_items WHERE quote_id = $2`,
      [orderId, quoteId],
    ),
  insertInvoice: (db: Db, orderId: number, customerId: number, subtotal: number, tax: number, total: number) =>
    q1<{ id: number }>(
      db,
      `INSERT INTO invoices (kind, order_id, customer_id, subtotal, tax_amount, total)
       VALUES ('order',$1,$2,$3,$4,$5) RETURNING id`,
      [orderId, customerId, subtotal, tax, total],
    ),
  copyQuoteItemsToInvoice: (db: Db, invoiceId: number, quoteId: number) =>
    exec(
      db,
      `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price)
       SELECT $1, description, quantity, unit_price FROM quote_items WHERE quote_id = $2`,
      [invoiceId, quoteId],
    ),
  insertDiscountLine: (db: Db, invoiceId: number, amount: number) =>
    exec(db, `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) VALUES ($1,'Discount',1,$2)`, [invoiceId, -amount]),
  insertSubsidy: (db: Db, orderId: number, expected: number) =>
    exec(db, 'INSERT INTO subsidy_applications (order_id, expected_amount) VALUES ($1,$2)', [orderId, expected]),

  // ---- confirmation (advance received) ----
  markConfirmed: (db: Db, orderId: number) => exec(db, `UPDATE orders SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [orderId]),
  ensureDispatch: (db: Db, orderId: number) => exec(db, 'INSERT INTO dispatches (order_id) VALUES ($1) ON CONFLICT (order_id) DO NOTHING', [orderId]),
  ensureJob: (db: Db, orderId: number) =>
    q1<{ id: number }>(db, 'INSERT INTO installation_jobs (order_id) VALUES ($1) ON CONFLICT (order_id) DO NOTHING RETURNING id', [orderId]),
  leastLoadedTechnician: (db: Db) =>
    q1<{ id: number }>(
      db,
      `SELECT u.id FROM users u WHERE u.role = 'technician' AND u.active
        ORDER BY (SELECT count(*) FROM job_crew c JOIN installation_jobs ij ON ij.id = c.job_id WHERE c.user_id = u.id AND ij.status <> 'completed'), u.id LIMIT 1`,
    ),
  scheduleJob: (db: Db, jobId: number, date: string) =>
    exec(db, `UPDATE installation_jobs SET status = 'scheduled', scheduled_date = $2::date WHERE id = $1`, [jobId, date]),
  addCrew: (db: Db, jobId: number, userId: number) => exec(db, 'INSERT INTO job_crew (job_id, user_id) VALUES ($1,$2)', [jobId, userId]),
  clearCrew: (db: Db, jobId: number) => exec(db, 'DELETE FROM job_crew WHERE job_id = $1', [jobId]),

  // ---- cancel / schedule ----
  lockStatus: (db: Db, id: number) => q1<{ status: string }>(db, 'SELECT status FROM orders WHERE id = $1 FOR UPDATE', [id]),
  paidTotal: async (db: Db, id: number) =>
    (await q1<{ paid: number }>(db, 'SELECT COALESCE(SUM(p.amount),0) AS paid FROM invoices i JOIN payments p ON p.invoice_id = i.id WHERE i.order_id = $1', [id]))?.paid ?? 0,
  hasScannedUnits: async (db: Db, id: number) => !!(await q1(db, 'SELECT 1 FROM inventory_units WHERE order_id = $1 LIMIT 1', [id])),
  cancel: async (db: Db, id: number) => {
    await exec(db, `UPDATE orders SET status = 'cancelled' WHERE id = $1`, [id]);
    await exec(db, `UPDATE invoices SET status = 'void' WHERE order_id = $1`, [id]);
  },
  lockJob: (db: Db, orderId: number) =>
    q1<{ id: number; status: string }>(db, 'SELECT j.id, j.status FROM installation_jobs j WHERE j.order_id = $1 FOR UPDATE', [orderId]),
  activeTechnicians: (db: Db, ids: number[]) =>
    q<{ id: number }>(db, `SELECT id FROM users WHERE id = ANY($1::int[]) AND role = 'technician' AND active`, [ids]),

  dispatchStatus: async (db: Db, orderId: number) => (await q1<{ status: string }>(db, 'SELECT status FROM dispatches WHERE order_id = $1', [orderId]))?.status ?? null,
};
