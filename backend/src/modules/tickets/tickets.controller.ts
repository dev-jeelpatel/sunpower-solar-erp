import { idOf, paging, str, wrap } from '../../lib/http';
import { ticketsService } from './tickets.service';

export const ticketsController = {
  list: wrap(async (req, res) => {
    const { limit, offset, page } = paging(req.query);
    const mine = req.user.role === 'support' && req.query.mine === '1';
    const r = await ticketsService.list({ status: str(req.query.status), q: str(req.query.q), assignedTo: mine ? req.user.id : null, limit, offset });
    res.json({ ...r, page, limit });
  }),
  get: wrap(async (req, res) => res.json(await ticketsService.get(idOf(req)))),
  create: wrap(async (req, res) => res.status(201).json(await ticketsService.create(req.body, req.user.id))),
  assign: wrap(async (req, res) => res.json(await ticketsService.assign(idOf(req), req.body.userId))),
  addLine: wrap(async (req, res) => res.status(201).json(await ticketsService.addLine(idOf(req), req.body))),
  removeLine: wrap(async (req, res) => res.json(await ticketsService.removeLine(idOf(req), Number(req.params.lineId)))),
  resolve: wrap(async (req, res) => res.json(await ticketsService.resolve(idOf(req), req.body, req.user.id))),
  confirm: wrap(async (req, res) => res.json(await ticketsService.confirm(idOf(req), req.user.id))),
  reopen: wrap(async (req, res) => res.json(await ticketsService.reopen(idOf(req)))),
};
