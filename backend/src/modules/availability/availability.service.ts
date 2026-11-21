import { unprocessable } from '../../lib/errors';
import { type Db, prisma, q } from '../../lib/prisma';

/** A technician can do one installation a day, or up to three site surveys, but not both. */
export const MAX_SURVEYS_PER_DAY = 3;
const LOOKAHEAD_DAYS = 21;

type Install = { jobId: number; orderNo: string; customer: string };
type Survey = { enquiryId: number; customer: string };
type Day = { installs: Install[]; surveys: Survey[] };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Busy status of one day, with the reason in plain words. */
function judge(day: Day | undefined) {
  if (!day) return { busy: false, reason: null as string | null, note: null as string | null };
  if (day.installs.length) {
    const i = day.installs[0];
    return { busy: true, reason: `Already installing ${i.orderNo} (${i.customer})`, note: null };
  }
  if (day.surveys.length >= MAX_SURVEYS_PER_DAY) return { busy: true, reason: `${day.surveys.length} site surveys already booked`, note: null };
  if (day.surveys.length) return { busy: false, reason: null, note: `${day.surveys.length} survey${day.surveys.length === 1 ? '' : 's'} booked that day` };
  return { busy: false, reason: null, note: null };
}

async function load(db: Db, from: string, excludeJobId: number | null) {
  const range = [from, LOOKAHEAD_DAYS + 1];
  const [techs, installs, surveys] = await Promise.all([
    q<{ id: number; name: string }>(db, "SELECT id, name FROM users WHERE role = 'technician' AND active ORDER BY name"),
    q<{ user_id: number; d: string; job_id: number; order_no: string; customer: string }>(
      db,
      `SELECT jc.user_id, to_char(ij.scheduled_date, 'YYYY-MM-DD') AS d, ij.id AS job_id, o.order_no, c.name AS customer
         FROM job_crew jc JOIN installation_jobs ij ON ij.id = jc.job_id AND ij.status = 'scheduled'
         JOIN orders o ON o.id = ij.order_id JOIN customers c ON c.id = o.customer_id
        WHERE ij.scheduled_date >= $1::date AND ij.scheduled_date < $1::date + $2::int AND ($3::int IS NULL OR ij.id <> $3)`,
      [...range, excludeJobId],
    ),
    q<{ technician_id: number; d: string; enquiry_id: number; customer: string }>(
      db,
      `SELECT s.technician_id, to_char(s.scheduled_date, 'YYYY-MM-DD') AS d, s.enquiry_id, e.customer_name AS customer
         FROM surveys s JOIN enquiries e ON e.id = s.enquiry_id
        WHERE s.status = 'scheduled' AND s.scheduled_date >= $1::date AND s.scheduled_date < $1::date + $2::int`,
      range,
    ),
  ]);
  const book = new Map<number, Map<string, Day>>();
  const day = (t: number, d: string) => {
    if (!book.has(t)) book.set(t, new Map());
    const m = book.get(t)!;
    if (!m.has(d)) m.set(d, { installs: [], surveys: [] });
    return m.get(d)!;
  };
  for (const i of installs) day(i.user_id, i.d).installs.push({ jobId: i.job_id, orderNo: i.order_no, customer: i.customer });
  for (const s of surveys) day(s.technician_id, s.d).surveys.push({ enquiryId: s.enquiry_id, customer: s.customer });
  return { techs, book };
}

function nextFree(book: Map<number, Map<string, Day>>, techId: number, from: string): string | null {
  for (let n = 1; n <= LOOKAHEAD_DAYS; n++) {
    const d = addDays(from, n);
    if (!judge(book.get(techId)?.get(d)).busy) return d;
  }
  return null;
}

export const availabilityService = {
  /** Every active technician with a yes/no for the date, why, and the next free day when busy. */
  async onDate(date: string, excludeJobId: number | null = null, db: Db = prisma) {
    const { techs, book } = await load(db, date, excludeJobId);
    return techs.map((t) => {
      const j = judge(book.get(t.id)?.get(date));
      return { id: t.id, name: t.name, available: !j.busy, reason: j.reason, note: j.note, nextFree: j.busy ? nextFree(book, t.id, date) : null };
    });
  },

  /** Refuse to double-book. The message says who is busy, why, and when they are next free. */
  async assertFree(db: Db, techId: number, date: string, excludeJobId: number | null = null) {
    const { techs, book } = await load(db, date, excludeJobId);
    const t = techs.find((x) => x.id === techId);
    if (!t) return; // not an active technician: the caller reports that separately
    const j = judge(book.get(techId)?.get(date));
    if (!j.busy) return;
    const nf = nextFree(book, techId, date);
    throw unprocessable(`${t.name} is not available on ${nice(date)}: ${j.reason}.${nf ? ` Next free day: ${nice(nf)}.` : ''}`, {
      technicianId: 'Not available on this date',
    });
  },
};
