import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { invoicesController as c } from './invoices.controller';
import { paySchema } from './invoices.schema';

export const invoicesRouter = Router();
invoicesRouter.use(authenticate);
invoicesRouter.get('/', c.list);
invoicesRouter.get('/:id', validate(idParam, 'params'), c.get);
invoicesRouter.post('/:id/payments', authorize('sales'), validate(idParam, 'params'), validate(paySchema), c.pay);
