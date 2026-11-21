import { type Db, exec, prisma, q, q1 } from '../../lib/prisma';
import type { PayInput } from './invoices.schema';

export const invoicesRepository = {
  async list(f: { status: string | null; kind: string | null; limit: number; offset: number }) {
    const params = [f.status, f.kind];
    const where = `($1::text IS NULL OR i.status::text = $1) AND ($2::text IS NULL OR i.kind::text = $2)`;
    const [items, total] = await Promise.all([
      q(
        prisma,
        `SELECT i.id, i.invoice_no, i.kind, i.status, i.total, i.issued_at, i.due_date, c.name AS customer_name,
                COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id),0) AS paid
           FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE ${where} ORDER BY i.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`,
        params,
      ),
      q1<{ n: number }>(prisma, `SELECT count(*) AS n FROM invoices i WHERE ${where}`, params),
    ]);
    return { items, total: total?.n ?? 0 };
  },

  findDetailed: (id: number) =>
    q1(
      prisma,
      `SELECT i.*, c.name AS customer_name, c.phone, c.email, c.address, c.city, o.order_no, t.ticket_no,
              COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id),0) AS paid
         FROM invoices i JOIN customers c ON c.id = i.customer_id LEFT JOIN orders o ON o.id = i.order_id LEFT JOIN tickets t ON t.id = i.ticket_id
        WHERE i.id = $1`,
      [id],
    ),
  itemsOf: (id: number) => q(prisma, 'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [id]),
  paymentsOf: (id: number) =>
    q(prisma, 'SELECT p.*, u.name AS received_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE invoice_id = $1 ORDER BY paid_at', [id]),

  lockInvoice: (db: Db, id: number) =>
    q1<{ id: number; status: string; total: number; order_id: number | null }>(db, 'SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [id]),
  paidOn: async (db: Db, id: number) =>
    Number((await q1<{ paid: number }>(db, 'SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id = $1', [id]))?.paid ?? 0),
  insertPayment: (db: Db, invoiceId: number, p: PayInput, userId: number) =>
    exec(db, 'INSERT INTO payments (invoice_id, amount, method, reference, received_by) VALUES ($1,$2,$3::payment_method,$4,$5)', [
      invoiceId, p.amount, p.method, p.reference ?? null, userId,
    ]),
  setStatus: (db: Db, id: number, status: string) => exec(db, 'UPDATE invoices SET status = $2::invoice_status WHERE id = $1', [id, status]),
  lockOrder: (db: Db, id: number) => q1<{ status: string; total: number }>(db, 'SELECT status, total FROM orders WHERE id = $1 FOR UPDATE', [id]),
};
