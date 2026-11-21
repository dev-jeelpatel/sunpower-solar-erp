import { exec, prisma, q, q1 } from '../../lib/prisma';

export const PERIODS = { today: 'day', week: 'week', month: 'month' } as const;
export type Period = keyof typeof PERIODS;

export const EXPORTS: Record<string, string> = {
  profitability:
    'SELECT order_no, customer_name, order_status, revenue, cash_received, material_cost, labour_cost, profit, margin_pct FROM v_job_profitability ORDER BY order_id',
  unfinished: `SELECT order_no, customer_name, order_status, total, paid, balance, next_step FROM v_order_pipeline WHERE next_step <> 'Complete' ORDER BY order_id`,
  invoices:
    'SELECT i.invoice_no, c.name AS customer, i.kind, i.status, i.total, i.issued_at, i.due_date FROM invoices i JOIN customers c ON c.id = i.customer_id ORDER BY i.id',
  payouts:
    'SELECT u.name AS technician, p.period_month, p.hours, p.amount, p.status, p.paid_at FROM technician_payouts p JOIN users u ON u.id = p.user_id ORDER BY p.period_month DESC, u.name',
};

export const reportsRepository = {
  /** `unit` always comes from the PERIODS whitelist, never from user input. */
  kpi: (unit: string) =>
    q1(
      prisma,
      `WITH s AS (SELECT date_trunc('${unit}', now()) AS start)
       SELECT
         (SELECT count(*) FROM enquiries, s WHERE created_at >= s.start)::int AS new_enquiries,
         (SELECT count(*) FROM quotes, s WHERE created_at >= s.start)::int AS quotes_created,
         (SELECT count(*) FROM orders, s WHERE created_at >= s.start AND status <> 'cancelled')::int AS orders_booked,
         (SELECT COALESCE(SUM(amount),0) FROM payments, s WHERE paid_at >= s.start) AS collections,
         (SELECT count(*) FROM installation_jobs, s WHERE signed_at >= s.start)::int AS installations_done,
         (SELECT COALESCE(SUM(profit),0) FROM v_job_profitability, s WHERE completed_at >= s.start) AS profit,
         (SELECT COALESCE(SUM(revenue),0) FROM v_job_profitability, s WHERE completed_at >= s.start) AS revenue_completed,
         (SELECT count(*) FROM tickets, s WHERE created_at >= s.start)::int AS tickets_opened`,
    ),
  pipeline: () => q(prisma, 'SELECT status::text, count(*)::int AS n FROM enquiries GROUP BY status'),
  trend: () =>
    q(
      prisma,
      `SELECT to_char(m, 'Mon YY') AS label, COALESCE(SUM(p.amount),0) AS collected
         FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
         LEFT JOIN payments p ON date_trunc('month', p.paid_at) = m GROUP BY m ORDER BY m`,
    ),
  lowStock: () =>
    q(prisma, 'SELECT sku, name, on_hand, reorder_level FROM v_stock WHERE active AND on_hand <= reorder_level AND reorder_level > 0 ORDER BY on_hand LIMIT 8'),
  tickets: () =>
    q1(
      prisma,
      `SELECT count(*) FILTER (WHERE status <> 'closed')::int AS open,
              count(*) FILTER (WHERE status IN ('open','assigned') AND priority IN ('high','urgent'))::int AS urgent
         FROM tickets`,
    ),
  subsidy: () =>
    q1(
      prisma,
      `SELECT count(*)::int AS open, COALESCE(SUM(expected_amount),0) AS expected FROM subsidy_applications WHERE status NOT IN ('disbursed','rejected')`,
    ),
  unfinishedCount: async () => (await q1<{ n: number }>(prisma, `SELECT count(*)::int AS n FROM v_order_pipeline WHERE next_step <> 'Complete'`))?.n ?? 0,
  receivables: async () =>
    (
      await q1<{ due: number }>(
        prisma,
        `SELECT COALESCE(SUM(i.total - COALESCE(p.paid,0)),0) AS due FROM invoices i
           LEFT JOIN LATERAL (SELECT SUM(amount) AS paid FROM payments WHERE invoice_id = i.id) p ON TRUE
          WHERE i.status IN ('sent','partially_paid')`,
      )
    )?.due ?? 0,

  profitability: (result: string | null) =>
    q<{ revenue: number; profit: number }>(
      prisma,
      `SELECT * FROM v_job_profitability WHERE ($1::text IS NULL OR (CASE WHEN profit >= 0 THEN 'profit' ELSE 'loss' END) = $1)
        ORDER BY order_id DESC LIMIT 500`,
      [result],
    ),
  unfinished: () => q(prisma, `SELECT * FROM v_order_pipeline WHERE next_step <> 'Complete' ORDER BY order_id DESC`),
  exportRows: (sql: string) => q(prisma, sql),

  computePayouts: (month: string) =>
    q<{ user_id: number; hours: number; amount: number }>(
      prisma,
      `SELECT u.id AS user_id, u.name, u.hourly_rate,
              COALESCE(SUM(l.hours),0) AS hours, COALESCE(SUM(l.hours * u.hourly_rate),0) AS amount, count(j.id)::int AS jobs
         FROM users u
         LEFT JOIN job_crew c ON c.user_id = u.id
         LEFT JOIN installation_jobs j ON j.id = c.job_id AND j.status = 'completed' AND date_trunc('month', j.finished_at) = $1::date
         LEFT JOIN v_job_labour l ON l.job_id = j.id
        WHERE u.role = 'technician' AND u.active GROUP BY u.id ORDER BY u.name`,
      [`${month}-01`],
    ),
  savedPayouts: (month: string) => q<{ user_id: number }>(prisma, 'SELECT * FROM technician_payouts WHERE period_month = $1::date', [`${month}-01`]),
  upsertPayout: (userId: number, month: string, hours: number, amount: number) =>
    exec(
      prisma,
      `INSERT INTO technician_payouts (user_id, period_month, hours, amount) VALUES ($1,$2::date,$3,$4)
       ON CONFLICT (user_id, period_month) DO UPDATE SET hours = EXCLUDED.hours, amount = EXCLUDED.amount WHERE technician_payouts.status = 'pending'`,
      [userId, `${month}-01`, hours, amount],
    ),
  payPayout: (id: number) =>
    q1(prisma, `UPDATE technician_payouts SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`, [id]),
};
