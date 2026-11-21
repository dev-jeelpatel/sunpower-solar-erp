import { notFound, unprocessable } from '../../lib/errors';
import { toCsv, today } from '../../lib/utils';
import { EXPORTS, PERIODS, type Period, reportsRepository as repo } from './reports.repository';

export const reportsService = {
  /** "How is the company doing today / this week / this month?" */
  async dashboard(periodParam: string) {
    const period: Period = periodParam in PERIODS ? (periodParam as Period) : 'month';
    const [kpi, pipeline, trend, lowStock, tickets, subsidy, unfinishedOrders, receivables] = await Promise.all([
      repo.kpi(PERIODS[period]), repo.pipeline(), repo.trend(), repo.lowStock(), repo.tickets(), repo.subsidy(),
      repo.unfinishedCount(), repo.receivables(),
    ]);
    return { period, kpi, pipeline, trend, lowStock, tickets, subsidy, unfinishedOrders, receivables };
  },

  /** Which installations made money, which lost money. */
  async profitability(result: string | null) {
    const items = await repo.profitability(result);
    const summary = items.reduce<Record<'revenue' | 'profit' | 'profitable' | 'losing', number>>(
      (s, r) => ({
        revenue: s.revenue + r.revenue,
        profit: s.profit + r.profit,
        profitable: s.profitable + (r.profit >= 0 ? 1 : 0),
        losing: s.losing + (r.profit < 0 ? 1 : 0),
      }),
      { revenue: 0, profit: 0, profitable: 0, losing: 0 },
    );
    return { summary, items };
  },

  unfinished: repo.unfinished,

  async exportCsv(type: string) {
    const sql = EXPORTS[type];
    if (!sql) throw notFound('Report');
    return { filename: `${type}-${today()}.csv`, csv: toCsv(await repo.exportRows(sql)) };
  },

  /** Hours worked on signed-off jobs in the month x each technician's hourly rate. */
  async payouts(month: string) {
    const [computed, saved] = await Promise.all([repo.computePayouts(month), repo.savedPayouts(month)]);
    const byUser = new Map(saved.map((s) => [s.user_id, s]));
    return computed.map((c) => ({ ...c, payout: byUser.get(c.user_id) ?? null }));
  },

  async generatePayouts(month: string) {
    const due = (await repo.computePayouts(month)).filter((x) => x.hours > 0);
    for (const c of due) await repo.upsertPayout(c.user_id, month, c.hours, c.amount);
    return { generated: due.length };
  },

  async pay(id: number) {
    const row = await repo.payPayout(id);
    if (!row) throw unprocessable('Payout not found or already paid');
    return row;
  },
};
