import { idOf, paging, str, wrap } from '../../lib/http';
import { claimsService } from './claims.service';

export const claimsController = {
  list: wrap(async (req, res) => {
    const { limit, offset, page } = paging(req.query);
    const r = await claimsService.list(req.user, { status: str(req.query.status), q: str(req.query.q), limit, offset });
    res.json({ ...r, page, limit });
  }),
  stats: wrap(async (_req, res) => res.json(await claimsService.stats())),
  get: wrap(async (req, res) => res.json(await claimsService.get(idOf(req), req.user))),
  file: wrap(async (req, res) => res.status(201).json(await claimsService.file(req.body, req.user.id))),
  assign: wrap(async (req, res) => res.json(await claimsService.assign(idOf(req), req.body, req.user.id))),
  inspect: wrap(async (req, res) => res.json(await claimsService.inspect(idOf(req), req.body, req.user))),
  decide: wrap(async (req, res) => res.json(await claimsService.decide(idOf(req), req.body, req.user))),
  fulfil: wrap(async (req, res) => res.json(await claimsService.fulfil(idOf(req), req.body, req.user.id))),
  rma: wrap(async (req, res) => res.json(await claimsService.rma(idOf(req), req.body, req.user.id))),
  close: wrap(async (req, res) => res.json(await claimsService.close(idOf(req), req.user.id))),
  withdraw: wrap(async (req, res) => res.json(await claimsService.withdraw(idOf(req), req.body.reason, req.user.id))),
};
