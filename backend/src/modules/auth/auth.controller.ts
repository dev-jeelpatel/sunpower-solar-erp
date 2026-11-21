import { wrap } from '../../lib/http';
import { authService } from './auth.service';

export const authController = {
  login: wrap(async (req, res) => res.json(await authService.login(req.body))),
  me: wrap(async (req, res) => res.json(await authService.me(req.user.id))),
};
