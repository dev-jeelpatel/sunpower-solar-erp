import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { notFound } from '../../lib/errors';
import { wrap } from '../../lib/http';
import { publicRepository as repo } from './public.repository';

/** Read-only endpoints for the customer website (no login). */
export const websiteRouter = Router();

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many lookups from this device. Please try again in a few minutes.' },
});

websiteRouter.get('/packages', wrap(async (_req, res) => res.json(await repo.packages())));

websiteRouter.get(
  '/warranty/:serial',
  lookupLimiter,
  wrap(async (req, res) => {
    const serial = String(req.params.serial).trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{5,39}$/.test(serial)) throw notFound('Serial number');
    const unit = await repo.warranty(serial);
    if (!unit) throw notFound('Serial number');
    res.json(unit);
  }),
);
