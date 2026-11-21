import { prisma, q, q1 } from '../../lib/prisma';
import type { SubsidyInput } from './subsidies.schema';

export type SubsidyRow = { id: number; status: string; reference_no: string | null; approved_amount: number | null };

export const subsidiesRepository = {
  list: (status: string | null) =>
    q(
      prisma,
      `SELECT s.*, o.order_no, c.name AS customer_name FROM subsidy_applications s JOIN orders o ON o.id = s.order_id JOIN customers c ON c.id = o.customer_id
        WHERE ($1::text IS NULL OR s.status::text = $1) ORDER BY (s.status IN ('disbursed','rejected')), s.id DESC`,
      [status],
    ),
  find: (id: number) => q1<SubsidyRow>(prisma, 'SELECT * FROM subsidy_applications WHERE id = $1', [id]),
  update: (id: number, d: SubsidyInput) =>
    q1(
      prisma,
      `UPDATE subsidy_applications SET status = $2::subsidy_status, reference_no = COALESCE($3, reference_no),
              submitted_at = COALESCE($4::date, submitted_at, CASE WHEN $2 = 'submitted' THEN current_date END),
              approved_amount = COALESCE($5, approved_amount), notes = COALESCE($6, notes) WHERE id = $1 RETURNING *`,
      [id, d.status, d.referenceNo ?? null, d.submittedAt ?? null, d.approvedAmount ?? null, d.notes ?? null],
    ),
};
