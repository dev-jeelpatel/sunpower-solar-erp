import { Router } from 'express';
import { wrap } from '../../lib/http';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { z } from '../../lib/zod';
import { isoDate } from '../../lib/zod';
import { availabilityService } from './availability.service';

export const availabilityRouter = Router();
availabilityRouter.use(authenticate);

const query = z.object({ date: isoDate('Date'), excludeJobId: z.coerce.number().int().positive().optional() });
availabilityRouter.get(
  '/',
  validate(query, 'query'),
  wrap(async (req, res) => {
    const { date, excludeJobId } = req.query as unknown as { date: string; excludeJobId?: number };
    res.json(await availabilityService.onDate(date, excludeJobId ?? null));
  }),
);
