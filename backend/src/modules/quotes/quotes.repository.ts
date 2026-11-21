import { type Db, exec, prisma, q, q1 } from '../../lib/prisma';

export type BomRow = { id: number; name: string; sell_price: number; cost_price: number; quantity: number };

export const quotesRepository = {
  async list(f: { status: string | null; enquiryId: number | null; limit: number; offset: number }) {
    const params = [f.status, f.enquiryId];
    const where = `($1::text IS NULL OR q.status::text = $1) AND ($2::int IS NULL OR q.enquiry_id = $2)`;
    const [items, total] = await Promise.all([
      q(
        prisma,
        `SELECT q.id, q.quote_no, q.status, q.total, q.valid_until, q.created_at, e.customer_name, pk.name AS package_name
           FROM quotes q JOIN enquiries e ON e.id = q.enquiry_id JOIN packages pk ON pk.id = q.package_id
          WHERE ${where} ORDER BY q.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`,
        params,
      ),
      q1<{ n: number }>(prisma, `SELECT count(*) AS n FROM quotes q WHERE ${where}`, params),
    ]);
    return { items, total: total?.n ?? 0 };
  },

  findDetailed: (id: number) =>
    q1(
      prisma,
      `SELECT q.*, e.customer_id, e.customer_name, e.phone, e.email, e.address, e.city, e.subsidy_required, e.requested_kw,
              pk.name AS package_name, pk.capacity_kw, u.name AS created_by_name, (q.valid_until < current_date) AS expired
         FROM quotes q JOIN enquiries e ON e.id = q.enquiry_id JOIN packages pk ON pk.id = q.package_id
         LEFT JOIN users u ON u.id = q.created_by WHERE q.id = $1`,
      [id],
    ),
  itemsOf: (id: number) => q(prisma, 'SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY id', [id]),
  orderOf: (id: number) => q1(prisma, 'SELECT id, order_no FROM orders WHERE quote_id = $1', [id]),

  lockEnquiry: (db: Db, id: number) =>
    q1<{ status: string; requested_kw: number; system_type: string }>(
      db,
      'SELECT status, requested_kw, system_type FROM enquiries WHERE id = $1 FOR UPDATE',
      [id],
    ),
  activePackage: (db: Db, id: number) => q1<{ id: number; kind: string }>(db, 'SELECT * FROM packages WHERE id = $1 AND active', [id]),
  bomOf: (db: Db, packageId: number) =>
    q<BomRow>(
      db,
      `SELECT p.id, p.name, p.sell_price, p.cost_price, pi.quantity FROM package_items pi JOIN products p ON p.id = pi.product_id
        WHERE pi.package_id = $1 ORDER BY p.category, p.name`,
      [packageId],
    ),

  insert: (db: Db, v: { enquiryId: number; packageId: number; subtotal: number; discount: number; taxPercent: number; tax: number; total: number; validUntil: string; userId: number }) =>
    q1<{ id: number }>(
      db,
      `INSERT INTO quotes (enquiry_id, package_id, subtotal, discount, tax_percent, tax_amount, total, valid_until, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9) RETURNING id`,
      [v.enquiryId, v.packageId, v.subtotal, v.discount, v.taxPercent, v.tax, v.total, v.validUntil, v.userId],
    ),
  insertItem: (db: Db, quoteId: number, i: BomRow) =>
    exec(
      db,
      'INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, unit_cost) VALUES ($1,$2,$3,$4,$5,$6)',
      [quoteId, i.id, i.name, i.quantity, i.sell_price, i.cost_price],
    ),
  markEnquiryQuoted: (db: Db, id: number) => exec(db, `UPDATE enquiries SET status = 'quoted' WHERE id = $1`, [id]),

  transition: (db: Db, id: number, to: string, from: string[]) =>
    q1<{ id: number; enquiry_id: number }>(
      db,
      'UPDATE quotes SET status = $2::quote_status WHERE id = $1 AND status = ANY($3::quote_status[]) RETURNING id, enquiry_id',
      [id, to, from],
    ),
  statusOf: (db: Db, id: number) => q1<{ status: string }>(db, 'SELECT status FROM quotes WHERE id = $1', [id]),

  find: (id: number) => q1<{ status: string; enquiry_id: number; quote_no: string }>(prisma, 'SELECT status, enquiry_id, quote_no FROM quotes WHERE id = $1', [id]),
  remove: (id: number) => exec(prisma, 'DELETE FROM quotes WHERE id = $1', [id]),

  productsByIds: (db: Db, ids: number[]) =>
    q<{ id: number; name: string; sell_price: number; cost_price: number }>(db, 'SELECT id, name, sell_price, cost_price FROM products WHERE active AND id = ANY($1::int[])', [ids]),
  setSystemType: (db: Db, enquiryId: number, type: string) => exec(db, 'UPDATE enquiries SET system_type = $2::system_type WHERE id = $1', [enquiryId, type]),
};
