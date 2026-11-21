import { type Db, exec, prisma, q, q1, type Row } from '../../lib/prisma';

export type ClaimRow = Row & {
  id: number; claim_no: string; status: string; customer_id: number; unit_id: number; technician_id: number | null;
  covered: boolean; remedy: string | null; recommendation: string | null; replacement_unit_id: number | null; rma: string;
};
export type UnitRow = Row & {
  id: number; product_id: number; serial_no: string; status: string; customer_id: number | null; order_id: number | null;
  dispatch_id: number | null; warranty_start: string | null; warranty_end: string | null;
};

const SELECT = `SELECT c.*, cu.name AS customer_name, cu.phone, cu.address, cu.city, u.serial_no, u.warranty_start AS unit_warranty_start,
                        u.warranty_end AS unit_warranty_end, p.id AS product_id, p.name AS product_name, p.sku, p.category, p.warranty_months,
                        t.name AS technician_name, t.phone AS technician_phone, d.name AS decided_name, f.name AS filed_name,
                        ru.serial_no AS replacement_serial, tk.ticket_no
                   FROM warranty_claims c
                   JOIN customers cu ON cu.id = c.customer_id
                   JOIN inventory_units u ON u.id = c.unit_id
                   JOIN products p ON p.id = u.product_id
                   LEFT JOIN users t ON t.id = c.technician_id
                   LEFT JOIN users d ON d.id = c.decided_by
                   LEFT JOIN users f ON f.id = c.filed_by
                   LEFT JOIN inventory_units ru ON ru.id = c.replacement_unit_id
                   LEFT JOIN tickets tk ON tk.id = c.ticket_id`;

export const claimsRepository = {
  async list(f: { status: string | null; q: string | null; technicianId: number | null; limit: number; offset: number }) {
    const params = [f.status, f.q ? `%${f.q}%` : null, f.technicianId];
    const where = `($1::text IS NULL OR c.status::text = $1 OR ($1 = 'active' AND c.status NOT IN ('closed','rejected','withdrawn')))
                   AND ($2::text IS NULL OR c.claim_no ILIKE $2 OR cu.name ILIKE $2 OR cu.phone ILIKE $2 OR u.serial_no ILIKE $2)
                   AND ($3::int IS NULL OR c.technician_id = $3)`;
    const [items, total] = await Promise.all([
      q(prisma, `${SELECT} WHERE ${where} ORDER BY (c.status IN ('closed','rejected','withdrawn')), c.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params),
      q1<{ n: number }>(
        prisma,
        `SELECT count(*) AS n FROM warranty_claims c JOIN customers cu ON cu.id = c.customer_id JOIN inventory_units u ON u.id = c.unit_id WHERE ${where}`,
        params,
      ),
    ]);
    return { items, total: total?.n ?? 0 };
  },

  /** Numbers for the page header cards. */
  stats: () =>
    q1<Row>(
      prisma,
      `SELECT count(*) FILTER (WHERE status = 'filed')::int AS filed,
              count(*) FILTER (WHERE status = 'inspecting')::int AS inspecting,
              count(*) FILTER (WHERE status = 'inspected')::int AS to_decide,
              count(*) FILTER (WHERE status = 'approved')::int AS to_fulfil,
              count(*) FILTER (WHERE status = 'fulfilled')::int AS to_close,
              count(*) FILTER (WHERE status = 'rejected' AND decided_at >= date_trunc('month', now()))::int AS rejected_month,
              count(*) FILTER (WHERE status IN ('approved','fulfilled','closed') AND decided_at >= date_trunc('month', now()))::int AS approved_month,
              COALESCE(SUM(repair_cost) FILTER (WHERE status IN ('fulfilled','closed')), 0)::float AS repair_cost,
              COALESCE(SUM(supplier_credit), 0)::float AS credit,
              count(*) FILTER (WHERE rma IN ('pending','sent'))::int AS rma_open
         FROM warranty_claims`,
    ),

  findDetailed: (id: number) => q1<ClaimRow>(prisma, `${SELECT} WHERE c.id = $1`, [id]),
  timeline: (id: number) =>
    q(prisma, `SELECT a.action, a.detail, a.created_at, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
                WHERE a.entity = 'claim' AND a.entity_id = $1 ORDER BY a.id DESC`, [id]),
  lock: (db: Db, id: number) => q1<ClaimRow>(db, 'SELECT * FROM warranty_claims WHERE id = $1 FOR UPDATE', [id]),

  unitBySerial: (db: Db, serial: string) =>
    q1<UnitRow>(db, 'SELECT u.*, p.warranty_months, p.name AS product_name FROM inventory_units u JOIN products p ON p.id = u.product_id WHERE u.serial_no = $1', [serial]),
  liveClaimOnUnit: (db: Db, unitId: number) =>
    q1<{ id: number; claim_no: string }>(db, `SELECT id, claim_no FROM warranty_claims WHERE unit_id = $1 AND status NOT IN ('rejected','closed','withdrawn')`, [unitId]),
  ticket: (db: Db, id: number) => q1<{ id: number; customer_id: number }>(db, 'SELECT id, customer_id FROM tickets WHERE id = $1', [id]),

  insert: (db: Db, v: { customerId: number; unitId: number; ticketId: number | null; issue: string; faultCode: string | null; covered: boolean; warrantyEnd: string | null; userId: number }) =>
    q1<{ id: number }>(
      db,
      `INSERT INTO warranty_claims (customer_id, unit_id, ticket_id, issue, fault_code, covered, warranty_end, filed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8) RETURNING id`,
      [v.customerId, v.unitId, v.ticketId, v.issue, v.faultCode, v.covered, v.warrantyEnd, v.userId],
    ),

  isActiveTechnician: async (db: Db, id: number) => !!(await q1(db, `SELECT 1 FROM users WHERE id = $1 AND role = 'technician' AND active`, [id])),
  assign: (db: Db, id: number, techId: number, date: string) =>
    exec(db, `UPDATE warranty_claims SET status = 'inspecting', technician_id = $2, inspection_date = $3::date WHERE id = $1`, [id, techId, date]),
  inspect: (db: Db, id: number, d: { findings: string; cause: string; recommendation: string }) =>
    exec(db, `UPDATE warranty_claims SET status = 'inspected', findings = $2, cause = $3::claim_cause, recommendation = $4::claim_recommendation, inspected_at = now() WHERE id = $1`,
      [id, d.findings, d.cause, d.recommendation]),
  approve: (db: Db, id: number, userId: number, remedy: string, notes: string, goodwill: boolean) =>
    exec(db, `UPDATE warranty_claims SET status = 'approved', remedy = $3::claim_remedy, decision_notes = $4, goodwill = $5, decided_by = $2, decided_at = now() WHERE id = $1`,
      [id, userId, remedy, notes, goodwill]),
  reject: (db: Db, id: number, userId: number, notes: string) =>
    exec(db, `UPDATE warranty_claims SET status = 'rejected', decision_notes = $3, decided_by = $2, decided_at = now(), closed_at = now() WHERE id = $1`, [id, userId, notes]),

  lockUnitBySerial: (db: Db, serial: string) =>
    q1<UnitRow & { warranty_months: number }>(db, 'SELECT u.*, p.warranty_months FROM inventory_units u JOIN products p ON p.id = u.product_id WHERE serial_no = $1 FOR UPDATE OF u', [serial]),
  unitById: (db: Db, id: number) => q1<UnitRow>(db, 'SELECT * FROM inventory_units WHERE id = $1', [id]),
  markFaulty: (db: Db, id: number) => exec(db, `UPDATE inventory_units SET status = 'faulty' WHERE id = $1`, [id]),
  /** The replacement takes over the customer and keeps the warranty that was left on the faulty unit. */
  installReplacement: (db: Db, id: number, old: UnitRow) =>
    exec(db, `UPDATE inventory_units SET status = 'delivered', customer_id = $2, order_id = $3, dispatch_id = $4, warranty_start = current_date, warranty_end = $5::date WHERE id = $1`,
      [id, old.customer_id, old.order_id, old.dispatch_id, old.warranty_end]),
  stockOut: (db: Db, productId: number, claimId: number, userId: number) =>
    exec(db, `INSERT INTO stock_movements (product_id, qty, reason, ref_type, ref_id, created_by) VALUES ($1,-1,'service_part'::movement_reason,'claim',$2,$3)`, [productId, claimId, userId]),
  fulfil: (db: Db, id: number, userId: number, replacementId: number | null, cost: number, notes: string | null, rma: string) =>
    exec(db, `UPDATE warranty_claims SET status = 'fulfilled', replacement_unit_id = $3, repair_cost = $4, fulfilment_notes = $5, rma = $6::rma_status, fulfilled_by = $2, fulfilled_at = now() WHERE id = $1`,
      [id, userId, replacementId, cost, notes, rma]),
  setRma: (db: Db, id: number, status: string, reference: string | null, credit: number | null) =>
    exec(db, `UPDATE warranty_claims SET rma = $2::rma_status, rma_reference = COALESCE($3, rma_reference), supplier_credit = COALESCE($4, supplier_credit) WHERE id = $1`, [id, status, reference, credit]),
  close: (db: Db, id: number) => exec(db, `UPDATE warranty_claims SET status = 'closed', customer_confirmed_at = now(), closed_at = now() WHERE id = $1`, [id]),
  withdraw: (db: Db, id: number) => exec(db, `UPDATE warranty_claims SET status = 'withdrawn', closed_at = now() WHERE id = $1`, [id]),
};
