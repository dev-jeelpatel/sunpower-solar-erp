import { idOf, paging, str, wrap } from '../../lib/http';
import { customersService } from './customers.service';

export const customersController = {
  list: wrap(async (req, res) => {
    const { limit, offset, page } = paging(req.query);
    res.json({ items: await customersService.list(str(req.query.q), limit, offset), page, limit });
  }),
  get: wrap(async (req, res) => res.json(await customersService.get(idOf(req)))),
  search: wrap(async (req, res) => res.json(await customersService.search(String(req.query.q ?? '')))),
};
