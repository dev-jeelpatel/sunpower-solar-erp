import { type Db, exec, prisma, q, q1 } from '../../lib/prisma';
import type { CompleteSurveyInput } from './surveys.schema';

type SurveyRow = { id: number; enquiry_id: number; technician_id: number; status: string };

export const surveysRepository = {
  list: (technicianId: number | null, status: string | null) =>
    q(
      prisma,
      `SELECT s.*, e.customer_name, e.address, e.city, e.requested_kw, e.system_type, t.name AS technician_name
         FROM surveys s JOIN enquiries e ON e.id = s.enquiry_id JOIN users t ON t.id = s.technician_id
        WHERE ($1::int IS NULL OR s.technician_id = $1) AND ($2::text IS NULL OR s.status::text = $2)
        ORDER BY s.scheduled_date DESC, s.id DESC LIMIT 200`,
      [technicianId, status],
    ),

  lockEnquiryStatus: (db: Db, id: number) => q1<{ status: string }>(db, 'SELECT status FROM enquiries WHERE id = $1 FOR UPDATE', [id]),
  isActiveTechnician: async (db: Db, id: number) => !!(await q1(db, `SELECT 1 FROM users WHERE id = $1 AND role = 'technician' AND active`, [id])),
  insert: (db: Db, enquiryId: number, technicianId: number, date: string) =>
    q1(db, 'INSERT INTO surveys (enquiry_id, technician_id, scheduled_date) VALUES ($1,$2,$3::date) RETURNING *', [enquiryId, technicianId, date]),
  setEnquiryStatus: (db: Db, id: number, status: string) => exec(db, 'UPDATE enquiries SET status = $2::enquiry_status WHERE id = $1', [id, status]),

  lock: (db: Db, id: number) => q1<SurveyRow>(db, 'SELECT * FROM surveys WHERE id = $1 FOR UPDATE', [id]),
  complete: (db: Db, id: number, d: CompleteSurveyInput) =>
    q1(
      db,
      `UPDATE surveys SET status = 'completed', roof_direction = $2, roof_tilt_deg = $3, cable_distance_m = $4,
              usable_area_sqft = $5, notes = $6, completed_at = now() WHERE id = $1 RETURNING *`,
      [id, d.roofDirection, d.roofTiltDeg, d.cableDistanceM, d.usableAreaSqft, d.notes ?? null],
    ),
  review: (db: Db, id: number, status: string, userId: number, notes: string | null) =>
    q1(db, 'UPDATE surveys SET status = $2::survey_status, reviewed_by = $3, review_notes = $4 WHERE id = $1 RETURNING *', [id, status, userId, notes]),
};
