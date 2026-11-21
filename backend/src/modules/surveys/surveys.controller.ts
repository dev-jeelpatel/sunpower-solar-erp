import { idOf, str, wrap } from '../../lib/http';
import { surveysService } from './surveys.service';

export const surveysController = {
  list: wrap(async (req, res) => res.json(await surveysService.list(req.user, str(req.query.status)))),
  schedule: wrap(async (req, res) => res.status(201).json(await surveysService.schedule(req.body, req.user.id))),
  complete: wrap(async (req, res) => res.json(await surveysService.complete(idOf(req), req.body, req.user))),
  review: wrap(async (req, res) => res.json(await surveysService.review(idOf(req), req.body, req.user.id))),
};
