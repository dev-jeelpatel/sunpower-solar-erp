import { idOf, paging, str, wrap } from '../../lib/http';
import { ordersService } from './orders.service';

export const ordersController = {
  list: wrap(async (req, res) => {
    const { limit, offset, page } = paging(req.query);
    res.json({ ...(await ordersService.list({ status: str(req.query.status), q: str(req.query.q), limit, offset })), page, limit });
  }),
  get: wrap(async (req, res) => res.json(await ordersService.get(idOf(req)))),
  cancel: wrap(async (req, res) => res.json(await ordersService.cancel(idOf(req), req.user.id))),
  schedule: wrap(async (req, res) => res.json(await ordersService.schedule(idOf(req), req.body, req.user.id))),
};
