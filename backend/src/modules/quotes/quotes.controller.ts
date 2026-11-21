import { idOf, paging, str, wrap } from '../../lib/http';
import { quotesService } from './quotes.service';

export const quotesController = {
  list: wrap(async (req, res) => {
    const { limit, offset, page } = paging(req.query);
    const enquiryId = req.query.enquiryId ? Number(req.query.enquiryId) : null;
    res.json({ ...(await quotesService.list({ status: str(req.query.status), enquiryId, limit, offset })), page, limit });
  }),
  get: wrap(async (req, res) => res.json(await quotesService.get(idOf(req)))),
  create: wrap(async (req, res) => res.status(201).json(await quotesService.create(req.body, req.user.id))),
  send: wrap(async (req, res) => res.json(await quotesService.send(idOf(req), req.user.id))),
  reject: wrap(async (req, res) => res.json(await quotesService.reject(idOf(req), req.user.id))),
  accept: wrap(async (req, res) => res.status(201).json(await quotesService.accept(idOf(req), req.user.id))),
  remove: wrap(async (req, res) => res.json(await quotesService.remove(idOf(req), req.user.id))),
};
