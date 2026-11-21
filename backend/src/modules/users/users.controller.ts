import { idOf, str, wrap } from '../../lib/http';
import { usersService } from './users.service';

export const usersController = {
  list: wrap(async (req, res) => res.json(await usersService.listActive(str(req.query.role)))),
  listAll: wrap(async (_req, res) => res.json(await usersService.listAll())),
  create: wrap(async (req, res) => res.status(201).json(await usersService.create(req.body))),
  update: wrap(async (req, res) => res.json(await usersService.update(idOf(req), req.body))),
};
