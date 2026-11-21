import { Router } from 'express';
import { idOf, wrap } from '../../lib/http';
import { exec, prisma, q, q1 } from '../../lib/prisma';
import { idParam } from '../../lib/zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

/** The newest 40 for the signed-in person, and how many are unread. */
notificationsRouter.get(
  '/',
  wrap(async (req, res) => {
    const [items, unread] = await Promise.all([
      q(prisma, 'SELECT id::int, event, title, link, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 40', [req.user.id]),
      q1<{ n: number }>(prisma, 'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]),
    ]);
    res.json({ items, unread: unread?.n ?? 0 });
  }),
);

notificationsRouter.post(
  '/read-all',
  wrap(async (req, res) => {
    await exec(prisma, 'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/:id/read',
  validate(idParam, 'params'),
  wrap(async (req, res) => {
    await exec(prisma, 'UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2', [idOf(req), req.user.id]);
    res.json({ ok: true });
  }),
);
