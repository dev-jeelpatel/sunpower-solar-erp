import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { subsidiesController as c } from './subsidies.controller';
import { subsidySchema } from './subsidies.schema';

export const subsidiesRouter = Router();
subsidiesRouter.use(authenticate);
subsidiesRouter.get('/', c.list);
subsidiesRouter.patch('/:id', authorize('sales'), validate(idParam, 'params'), validate(subsidySchema), c.update);
