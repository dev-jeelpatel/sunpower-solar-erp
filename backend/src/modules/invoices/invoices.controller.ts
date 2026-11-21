import { idOf, paging, str, wrap } from '../../lib/http';
import { invoicesService } from './invoices.service';

export const invoicesController = {
  list: wrap(async (req, res) => {
    const { limit, offset, page } = paging(req.query);
    res.json({ ...(await invoicesService.list({ status: str(req.query.status), kind: str(req.query.kind), limit, offset })), page, limit });
  }),
  get: wrap(async (req, res) => res.json(await invoicesService.get(idOf(req)))),
  pay: wrap(async (req, res) => res.status(201).json(await invoicesService.pay(idOf(req), req.body, req.user.id))),
};
