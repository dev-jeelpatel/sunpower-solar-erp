import { idOf, paging, str, wrap } from '../../lib/http';
import { enquiriesService } from './enquiries.service';

export const enquiriesController = {
  /** Public website form: no login. */
  createPublic: wrap(async (req, res) => {
    const e = await enquiriesService.create(req.body, 'web');
    res.status(201).json({ id: e.id, message: 'Thank you! Our team will call you shortly.' });
  }),

  list: wrap(async (req, res) => {
    const { limit, offset, page } = paging(req.query);
    // Salespeople see only their own list unless they pass ?all=1
    const assignedTo = req.user.role === 'sales' && !req.query.all ? req.user.id : req.query.assignedTo ? Number(req.query.assignedTo) : null;
    const r = await enquiriesService.list({ status: str(req.query.status), q: str(req.query.q), assignedTo, limit, offset });
    res.json({ ...r, page, limit });
  }),

  create: wrap(async (req, res) => res.status(201).json(await enquiriesService.create(req.body, req.body.source, req.user.id))),
  get: wrap(async (req, res) => res.json(await enquiriesService.get(idOf(req)))),
  qualify: wrap(async (req, res) => res.json(await enquiriesService.qualify(idOf(req), req.body, req.user.id))),
  assign: wrap(async (req, res) => res.json(await enquiriesService.assign(idOf(req), req.body.assignedTo, req.user.id))),
  update: wrap(async (req, res) => res.json(await enquiriesService.update(idOf(req), req.body, req.user.id))),
  remove: wrap(async (req, res) => res.json(await enquiriesService.remove(idOf(req)))),
};
