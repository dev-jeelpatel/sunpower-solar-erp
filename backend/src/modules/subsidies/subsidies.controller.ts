import { idOf, str, wrap } from '../../lib/http';
import { subsidiesService } from './subsidies.service';

export const subsidiesController = {
  list: wrap(async (req, res) => res.json(await subsidiesService.list(str(req.query.status)))),
  update: wrap(async (req, res) => res.json(await subsidiesService.update(idOf(req), req.body))),
};
