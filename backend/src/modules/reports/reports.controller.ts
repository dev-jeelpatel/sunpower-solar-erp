import { idOf, str, wrap } from '../../lib/http';
import { reportsService } from './reports.service';

export const reportsController = {
  dashboard: wrap(async (req, res) => res.json(await reportsService.dashboard(String(req.query.period ?? '')))),
  profitability: wrap(async (req, res) => res.json(await reportsService.profitability(str(req.query.result)))),
  unfinished: wrap(async (_req, res) => res.json(await reportsService.unfinished())),

  exportCsv: wrap(async (req, res) => {
    const { filename, csv } = await reportsService.exportCsv(String(req.params.type));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }),

  payouts: wrap(async (req, res) => res.json(await reportsService.payouts(String(req.query.month)))),
  generatePayouts: wrap(async (req, res) => res.json(await reportsService.generatePayouts(req.body.month))),
  pay: wrap(async (req, res) => res.json(await reportsService.pay(idOf(req)))),
};
