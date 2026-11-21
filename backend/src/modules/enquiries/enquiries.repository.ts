import { type Db, exec, prisma, q, q1 } from '../../lib/prisma';
import type { EnquiryInput, QualifyInput } from './enquiries.schema';

export const enquiriesRepository = {
  /** Least-loaded active salesperson gets the enquiry, so it never sits unassigned. */
  async pickSalesperson(db: Db): Promise<number | null> {
    const r = await q1<{ id: number }>(
      db,
      `SELECT u.id FROM users u
        WHERE u.role = 'sales' AND u.active
        ORDER BY (SELECT count(*) FROM enquiries e WHERE e.assigned_to = u.id AND e.status IN ('new','contacted')), u.id
        LIMIT 1`,
    );
    return r?.id ?? null;
  },

  async insert(db: Db, d: EnquiryInput, source: string, assignee: number | null) {
    const rows = await q(
      db,
      `INSERT INTO enquiries (customer_name, phone, email, address, city, requested_kw, system_type, subsidy_required, message, source, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7::system_type,$8,$9,$10::enquiry_source,$11) RETURNING *`,
      [
        d.name, d.phone, d.email ?? null, d.address, d.city ?? null, d.requestedKw, d.systemType,
        d.subsidyRequired ?? false, d.message ?? null, source, assignee,
      ],
    );
    return rows[0];
  },

  async list(f: { status: string | null; q: string | null; assignedTo: number | null; limit: number; offset: number }) {
    const params = [f.status, f.q ? `%${f.q}%` : null, f.assignedTo];
    const where = `($1::text IS NULL OR e.status::text = $1)
                   AND ($2::text IS NULL OR e.customer_name ILIKE $2 OR e.phone ILIKE $2 OR e.city ILIKE $2)
                   AND ($3::int IS NULL OR e.assigned_to = $3)`;
    const [items, total] = await Promise.all([
      q(
        prisma,
        `SELECT e.*, u.name AS assigned_name FROM enquiries e LEFT JOIN users u ON u.id = e.assigned_to
          WHERE ${where} ORDER BY e.created_at DESC LIMIT ${f.limit} OFFSET ${f.offset}`,
        params,
      ),
      q1<{ n: number }>(prisma, `SELECT count(*) AS n FROM enquiries e WHERE ${where}`, params),
    ]);
    return { items, total: total?.n ?? 0 };
  },

  findWithAssignee: (id: number) =>
    q1(prisma, `SELECT e.*, u.name AS assigned_name FROM enquiries e LEFT JOIN users u ON u.id = e.assigned_to WHERE e.id = $1`, [id]),

  surveysOf: (id: number) =>
    q(prisma, `SELECT s.*, t.name AS technician_name FROM surveys s JOIN users t ON t.id = s.technician_id WHERE enquiry_id = $1 ORDER BY s.id DESC`, [id]),

  quotesOf: (id: number) =>
    q(prisma, `SELECT id, quote_no, status, total, valid_until, created_at FROM quotes WHERE enquiry_id = $1 ORDER BY id DESC`, [id]),

  activityOf: (id: number) =>
    q(
      prisma,
      `SELECT a.action, a.detail, a.created_at, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.entity = 'enquiry' AND a.entity_id = $1 ORDER BY a.id DESC LIMIT 30`,
      [id],
    ),

  lockStatus: (db: Db, id: number) => q1<{ status: string }>(db, 'SELECT status FROM enquiries WHERE id = $1 FOR UPDATE', [id]),

  async saveQualification(db: Db, id: number, status: string, d: QualifyInput) {
    const rows = await q(
      db,
      `UPDATE enquiries SET status = $2::enquiry_status, shadow_free_sqft = $3, monthly_bill = $4, grid_suitable = $5, qualification_notes = $6
        WHERE id = $1 RETURNING *`,
      [id, status, d.shadowFreeSqft ?? null, d.monthlyBill ?? null, d.gridSuitable ?? null, d.notes ?? null],
    );
    return rows[0];
  },

  isActiveSalesperson: async (id: number) => !!(await q1(prisma, `SELECT id FROM users WHERE id = $1 AND role = 'sales' AND active`, [id])),

  async assign(id: number, userId: number) {
    const rows = await q(prisma, 'UPDATE enquiries SET assigned_to = $2 WHERE id = $1 RETURNING *', [id, userId]);
    return rows[0];
  },

  update: (db: Db, id: number, d: EnquiryInput) =>
    q1(
      db,
      `UPDATE enquiries SET customer_name=$2, phone=$3, email=$4, address=$5, city=$6, requested_kw=$7, system_type=$8::system_type, subsidy_required=$9, message=$10
        WHERE id=$1 RETURNING *`,
      [id, d.name, d.phone, d.email ?? null, d.address, d.city ?? null, d.requestedKw, d.systemType, d.subsidyRequired ?? false, d.message ?? null],
    ),
  quoteCount: async (db: Db, id: number) => (await q1<{ n: number }>(db, 'SELECT count(*) AS n FROM quotes WHERE enquiry_id = $1', [id]))?.n ?? 0,
  lockForDelete: (db: Db, id: number) => q1<{ status: string; customer_id: number | null }>(db, 'SELECT status, customer_id FROM enquiries WHERE id = $1 FOR UPDATE', [id]),
  remove: async (db: Db, id: number) => {
    await exec(db, `DELETE FROM activity_log WHERE entity = 'enquiry' AND entity_id = $1`, [id]);
    await exec(db, 'DELETE FROM enquiries WHERE id = $1', [id]);
  },
};
void exec;
