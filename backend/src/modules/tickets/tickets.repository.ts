import { type Db, exec, prisma, q, q1, type Row } from '../../lib/prisma';
import type { LineInput } from './tickets.schema';

export type TicketRow = Row & {
  id: number; status: string; customer_id: number; unit_id: number | null; warranty_status: string;
};
export type UnitRow = Row & { id: number; product_id: number; status: string; customer_id: number | null; order_id: number | null; warranty_end: string | null; warranty_months?: number };
export type LineRow = Row & { product_id: number | null; quantity: number; unit_price: number; unit_cost: number };

export const ticketsRepository = {
  async list(f: { status: string | null; q: string | null; assignedTo: number | null; limit: number; offset: number }) {
    const params = [f.status, f.q ? `%${f.q}%` : null, f.assignedTo];
    const where = `($1::text IS NULL OR t.status::text = $1 OR ($1 = 'active' AND t.status <> 'closed'))
                   AND ($2::text IS NULL OR t.ticket_no ILIKE $2 OR c.name ILIKE $2 OR c.phone ILIKE $2 OR u.serial_no ILIKE $2)
                   AND ($3::int IS NULL OR t.assigned_to = $3)`;
    const [items, total] = await Promise.all([
      q(
        prisma,
        `SELECT t.id, t.ticket_no, t.subject, t.status, t.priority, t.warranty_status, t.created_at, c.name AS customer_name, u.serial_no, a.name AS assigned_name
           FROM tickets t JOIN customers c ON c.id = t.customer_id LEFT JOIN inventory_units u ON u.id = t.unit_id LEFT JOIN users a ON a.id = t.assigned_to
          WHERE ${where} ORDER BY (t.status = 'closed'), array_position(ARRAY['urgent','high','normal','low'], t.priority::text), t.id DESC
          LIMIT ${f.limit} OFFSET ${f.offset}`,
        params,
      ),
      q1<{ n: number }>(
        prisma,
        `SELECT count(*) AS n FROM tickets t JOIN customers c ON c.id = t.customer_id LEFT JOIN inventory_units u ON u.id = t.unit_id WHERE ${where}`,
        params,
      ),
    ]);
    return { items, total: total?.n ?? 0 };
  },

  findDetailed: (id: number) =>
    q1<TicketRow>(
      prisma,
      `SELECT t.*, c.name AS customer_name, c.phone, c.address, u.serial_no, u.warranty_start, u.warranty_end, p.name AS product_name,
              a.name AS assigned_name, ru.serial_no AS replacement_serial,
              CASE WHEN u.id IS NULL THEN 'no_unit' WHEN u.warranty_end IS NULL THEN 'not_started'
                   WHEN u.warranty_end >= t.created_at::date THEN 'in_warranty' ELSE 'expired' END AS unit_warranty
         FROM tickets t JOIN customers c ON c.id = t.customer_id LEFT JOIN inventory_units u ON u.id = t.unit_id LEFT JOIN products p ON p.id = u.product_id
         LEFT JOIN users a ON a.id = t.assigned_to LEFT JOIN inventory_units ru ON ru.id = t.replacement_unit_id WHERE t.id = $1`,
      [id],
    ),
  linesOf: (id: number, db: Db = prisma) => q<LineRow>(db, 'SELECT * FROM ticket_lines WHERE ticket_id = $1 ORDER BY id', [id]),
  invoiceOf: (id: number) => q1(prisma, 'SELECT i.id, i.invoice_no, i.total, i.status FROM invoices i WHERE i.ticket_id = $1', [id]),

  unitBySerial: (db: Db, serial: string) => q1<UnitRow>(db, 'SELECT * FROM inventory_units WHERE serial_no = $1', [serial]),
  insert: (db: Db, v: { customerId: number; unitId: number | null; subject: string; description: string | null; faultCode: string | null; priority: string; warranty: string; userId: number }) =>
    q1<{ id: number }>(
      db,
      `INSERT INTO tickets (customer_id, unit_id, subject, description, fault_code, priority, warranty_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::ticket_priority,$7::warranty_state,$8) RETURNING id`,
      [v.customerId, v.unitId, v.subject, v.description, v.faultCode, v.priority, v.warranty, v.userId],
    ),

  isAssignable: async (userId: number) => !!(await q1(prisma, `SELECT 1 FROM users WHERE id = $1 AND role IN ('technician','support') AND active`, [userId])),
  assign: (id: number, userId: number) =>
    q1(
      prisma,
      `UPDATE tickets SET assigned_to = $2, status = CASE WHEN status = 'open' THEN 'assigned'::ticket_status ELSE status END
        WHERE id = $1 AND status IN ('open','assigned') RETURNING id`,
      [id, userId],
    ),

  lock: (db: Db, id: number) => q1<TicketRow>(db, 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [id]),
  product: (db: Db, id: number) => q1<{ name: string; sell_price: number; cost_price: number; tracked_serial: boolean }>(db, 'SELECT name, sell_price, cost_price, tracked_serial FROM products WHERE id = $1', [id]),
  insertLine: (db: Db, ticketId: number, l: LineInput, desc: string | undefined, price: number, cost: number) =>
    exec(
      db,
      'INSERT INTO ticket_lines (ticket_id, product_id, description, quantity, unit_price, unit_cost, is_labour) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [ticketId, l.productId ?? null, desc ?? null, l.quantity, price, cost, l.isLabour],
    ),
  deleteLine: (lineId: number, ticketId: number) =>
    exec(
      prisma,
      `DELETE FROM ticket_lines l USING tickets t WHERE l.id = $1 AND l.ticket_id = t.id AND t.id = $2 AND t.status IN ('open','assigned')`,
      [lineId, ticketId],
    ),

  // ---- resolution ----
  unitById: (db: Db, id: number) => q1<UnitRow>(db, 'SELECT * FROM inventory_units WHERE id = $1', [id]),
  lockReplacement: (db: Db, serial: string) =>
    q1<UnitRow>(
      db,
      'SELECT u.*, p.warranty_months FROM inventory_units u JOIN products p ON p.id = u.product_id WHERE serial_no = $1 FOR UPDATE OF u',
      [serial],
    ),
  markFaulty: (db: Db, id: number) => exec(db, `UPDATE inventory_units SET status = 'faulty' WHERE id = $1`, [id]),
  installReplacement: (db: Db, id: number, customerId: number, orderId: number | null, months: number) =>
    exec(
      db,
      `UPDATE inventory_units SET status = 'delivered', customer_id = $2, order_id = $3, warranty_start = current_date,
              warranty_end = (current_date + make_interval(months => $4::int))::date WHERE id = $1`,
      [id, customerId, orderId, months],
    ),
  movement: (db: Db, productId: number, qty: number, ticketId: number, userId: number) =>
    exec(
      db,
      `INSERT INTO stock_movements (product_id, qty, reason, ref_type, ref_id, created_by) VALUES ($1,$2,'service_part'::movement_reason,'ticket',$3,$4)`,
      [productId, qty, ticketId, userId],
    ),
  insertServiceInvoice: (db: Db, ticketId: number, customerId: number, subtotal: number, tax: number, total: number) =>
    q1<{ id: number }>(
      db,
      `INSERT INTO invoices (kind, ticket_id, customer_id, subtotal, tax_amount, total) VALUES ('service',$1,$2,$3,$4,$5) RETURNING id`,
      [ticketId, customerId, subtotal, tax, total],
    ),
  copyLinesToInvoice: (db: Db, invoiceId: number, ticketId: number) =>
    exec(
      db,
      'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) SELECT $1, description, quantity, unit_price FROM ticket_lines WHERE ticket_id = $2',
      [invoiceId, ticketId],
    ),
  markResolved: (db: Db, id: number, resolution: string, replacementId: number | null) =>
    exec(db, `UPDATE tickets SET status = 'resolved', resolution = $2, resolved_at = now(), replacement_unit_id = $3 WHERE id = $1`, [id, resolution, replacementId]),

  confirm: (id: number) =>
    q1(prisma, `UPDATE tickets SET status = 'closed', customer_confirmed_at = now() WHERE id = $1 AND status = 'resolved' RETURNING id`, [id]),
  reopenAssigned: (id: number) =>
    q1(prisma, `UPDATE tickets SET status = 'assigned', resolved_at = NULL WHERE id = $1 AND status = 'resolved' AND assigned_to IS NOT NULL RETURNING id`, [id]),
  reopenOpen: (id: number) => q1(prisma, `UPDATE tickets SET status = 'open', resolved_at = NULL WHERE id = $1 AND status = 'resolved' RETURNING id`, [id]),
};
