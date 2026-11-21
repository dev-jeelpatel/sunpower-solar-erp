import { type Db, exec, prisma, q, q1, type Row } from '../../lib/prisma';
import type { CompleteJobInput } from './jobs.schema';

export type JobRow = { id: number; order_id: number; status: string };

export const jobsRepository = {
  list: (technicianId: number | null, status: string | null) =>
    q(
      prisma,
      `SELECT j.id, j.status, j.scheduled_date, j.finished_at, o.order_no, o.status AS order_status, c.name AS customer_name, c.address, c.city, c.phone,
              pk.name AS package_name, pk.capacity_kw, d.status AS dispatch_status,
              (SELECT json_agg(u.name) FROM job_crew jc JOIN users u ON u.id = jc.user_id WHERE jc.job_id = j.id) AS crew
         FROM installation_jobs j JOIN orders o ON o.id = j.order_id JOIN customers c ON c.id = o.customer_id
         JOIN quotes q ON q.id = o.quote_id JOIN packages pk ON pk.id = q.package_id LEFT JOIN dispatches d ON d.order_id = o.id
        WHERE ($1::int IS NULL OR EXISTS (SELECT 1 FROM job_crew jc WHERE jc.job_id = j.id AND jc.user_id = $1))
          AND ($2::text IS NULL OR j.status::text = $2)
        ORDER BY (j.status = 'completed'), j.scheduled_date NULLS LAST, j.id DESC LIMIT 200`,
      [technicianId, status],
    ),

  find: (db: Db, id: number, lock = false) =>
    q1<Row & JobRow>(db, `SELECT * FROM installation_jobs WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]),
  isCrew: async (db: Db, jobId: number, userId: number) => !!(await q1(db, 'SELECT 1 FROM job_crew WHERE job_id = $1 AND user_id = $2', [jobId, userId])),

  orderContext: (orderId: number) =>
    q1(
      prisma,
      `SELECT o.id AS order_id, o.order_no, c.id AS customer_id, c.name AS customer_name, c.phone, c.address, c.city, pk.name AS package_name, pk.capacity_kw, d.status AS dispatch_status
         FROM orders o JOIN customers c ON c.id = o.customer_id JOIN quotes q ON q.id = o.quote_id JOIN packages pk ON pk.id = q.package_id
         LEFT JOIN dispatches d ON d.order_id = o.id WHERE o.id = $1`,
      [orderId],
    ),
  photos: (jobId: number) => q(prisma, 'SELECT id, file_path, caption, uploaded_at FROM job_photos WHERE job_id = $1 ORDER BY id', [jobId]),
  crew: (jobId: number) => q(prisma, 'SELECT u.id, u.name FROM job_crew c JOIN users u ON u.id = c.user_id WHERE c.job_id = $1', [jobId]),
  units: (orderId: number) =>
    q(
      prisma,
      `SELECT u.serial_no, u.warranty_end, p.name FROM inventory_units u JOIN products p ON p.id = u.product_id
        WHERE u.order_id = $1 ORDER BY p.category, u.serial_no`,
      [orderId],
    ),
  labour: (jobId: number) => q1(prisma, 'SELECT hours, labour_cost FROM v_job_labour WHERE job_id = $1', [jobId]),

  photoCount: async (db: Db, jobId: number) => (await q1<{ n: number }>(db, 'SELECT count(*)::int AS n FROM job_photos WHERE job_id = $1', [jobId]))?.n ?? 0,
  addPhoto: (jobId: number, filePath: string, caption: string | null, userId: number) =>
    exec(prisma, 'INSERT INTO job_photos (job_id, file_path, caption, uploaded_by) VALUES ($1,$2,$3,$4)', [jobId, filePath, caption, userId]),
  deletePhoto: (photoId: number, jobId: number) =>
    q1<{ file_path: string }>(prisma, 'DELETE FROM job_photos WHERE id = $1 AND job_id = $2 RETURNING file_path', [photoId, jobId]),

  completionContext: (db: Db, orderId: number) =>
    q1<{ dispatch_status: string | null; capacity_kw: number | null }>(
      db,
      `SELECT d.status AS dispatch_status, pk.capacity_kw FROM orders o JOIN quotes q ON q.id = o.quote_id JOIN packages pk ON pk.id = q.package_id
         LEFT JOIN dispatches d ON d.order_id = o.id WHERE o.id = $1`,
      [orderId],
    ),
  complete: (db: Db, jobId: number, d: CompleteJobInput, start: Date, end: Date) =>
    exec(
      db,
      `UPDATE installation_jobs SET status = 'completed', started_at = $2, finished_at = $3, confirmed_kw = $4, notes = $5,
              signer_name = $6, signature_data = $7, signed_at = now() WHERE id = $1`,
      [jobId, start, end, d.confirmedKw, d.notes ?? null, d.signerName, d.signature],
    ),
  completeOrder: (db: Db, orderId: number) => exec(db, `UPDATE orders SET status = 'completed', completed_at = now() WHERE id = $1`, [orderId]),
};
