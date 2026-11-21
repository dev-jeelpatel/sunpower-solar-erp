import { Router } from 'express';
import { wrap } from '../../lib/http';
import { prisma, q } from '../../lib/prisma';
import { isoDate, z } from '../../lib/zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

export const scheduleRouter = Router();
scheduleRouter.use(authenticate);

const query = z
  .object({ from: isoDate('Start date'), to: isoDate('End date'), technicianId: z.coerce.number().int().positive().optional() })
  .refine((d) => d.to >= d.from, { path: ['to'], message: 'The end date must not be before the start date' })
  .refine((d) => (Date.parse(d.to) - Date.parse(d.from)) / 864e5 <= 70, { path: ['to'], message: 'Choose a range of at most 10 weeks' });

/**
 * Everything on the calendar between two dates: site surveys, installations and warranty inspections.
 * A technician only sees their own work. Also returns the installations that are waiting for a technician.
 */
scheduleRouter.get(
  '/',
  validate(query, 'query'),
  wrap(async (req, res) => {
    const { from, to, technicianId } = req.query as unknown as { from: string; to: string; technicianId?: number };
    const tech = req.user.role === 'technician' ? req.user.id : technicianId ?? null;
    const params = [from, to, tech];

    const events = await q(
      prisma,
      `SELECT 'survey' AS type, s.id, to_char(s.scheduled_date, 'YYYY-MM-DD') AS date, s.status::text AS status, s.technician_id, t.name AS technician_name,
              e.customer_name, e.phone, e.address, e.city, e.requested_kw::float AS kw, ('/enquiries/' || e.id) AS link, 'Site survey' AS title
         FROM surveys s JOIN enquiries e ON e.id = s.enquiry_id JOIN users t ON t.id = s.technician_id
        WHERE s.scheduled_date BETWEEN $1::date AND $2::date AND s.status <> 'rejected' AND ($3::int IS NULL OR s.technician_id = $3)
       UNION ALL
       SELECT 'install', j.id, to_char(j.scheduled_date, 'YYYY-MM-DD'), j.status::text, min(jc.user_id), string_agg(t.name, ' & ' ORDER BY t.name),
              c.name, c.phone, c.address, c.city, pk.capacity_kw::float, ('/jobs/' || j.id), 'Installation ' || o.order_no
         FROM installation_jobs j JOIN job_crew jc ON jc.job_id = j.id JOIN users t ON t.id = jc.user_id JOIN orders o ON o.id = j.order_id
         JOIN customers c ON c.id = o.customer_id JOIN quotes qt ON qt.id = o.quote_id JOIN packages pk ON pk.id = qt.package_id
        WHERE j.scheduled_date BETWEEN $1::date AND $2::date AND j.status IN ('scheduled','completed')
          AND ($3::int IS NULL OR EXISTS (SELECT 1 FROM job_crew x WHERE x.job_id = j.id AND x.user_id = $3))
        GROUP BY j.id, o.order_no, c.name, c.phone, c.address, c.city, pk.capacity_kw
       UNION ALL
       SELECT 'inspection', w.id, to_char(w.inspection_date, 'YYYY-MM-DD'), w.status::text, w.technician_id, t.name,
              c.name, c.phone, c.address, c.city, NULL, ('/claims/' || w.id), 'Warranty inspection ' || w.claim_no
         FROM warranty_claims w JOIN customers c ON c.id = w.customer_id JOIN users t ON t.id = w.technician_id
        WHERE w.inspection_date BETWEEN $1::date AND $2::date AND w.status NOT IN ('withdrawn') AND ($3::int IS NULL OR w.technician_id = $3)
       ORDER BY 3, 1, 2`,
      params,
    );

    const toAssign =
      req.user.role === 'technician'
        ? []
        : await q(
            prisma,
            `SELECT j.id, j.order_id, o.order_no, c.name AS customer_name, c.phone, c.address, c.city, pk.capacity_kw::float AS kw, to_char(d.delivered_at, 'YYYY-MM-DD') AS delivered_on
               FROM installation_jobs j JOIN orders o ON o.id = j.order_id JOIN customers c ON c.id = o.customer_id JOIN quotes qt ON qt.id = o.quote_id
               JOIN packages pk ON pk.id = qt.package_id JOIN dispatches d ON d.order_id = o.id
              WHERE d.status = 'delivered' AND j.status <> 'completed' AND NOT EXISTS (SELECT 1 FROM job_crew jc WHERE jc.job_id = j.id)
              ORDER BY d.delivered_at LIMIT 20`,
          );
    res.json({ events, toAssign });
  }),
);
