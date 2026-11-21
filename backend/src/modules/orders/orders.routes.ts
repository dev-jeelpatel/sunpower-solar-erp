import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ordersController as c } from './orders.controller';
import { scheduleSchema } from './orders.schema';

export const ordersRouter = Router();
ordersRouter.use(authenticate);
ordersRouter.get('/', c.list);
ordersRouter.get('/:id', validate(idParam, 'params'), c.get);
ordersRouter.post('/:id/cancel', authorize('sales'), validate(idParam, 'params'), c.cancel);
ordersRouter.post('/:id/schedule', authorize('sales'), validate(idParam, 'params'), validate(scheduleSchema), c.schedule);
