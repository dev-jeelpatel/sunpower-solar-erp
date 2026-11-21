import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { quotesController as c } from './quotes.controller';
import { createQuoteSchema } from './quotes.schema';

export const quotesRouter = Router();
quotesRouter.use(authenticate);
quotesRouter.get('/', c.list);
quotesRouter.get('/:id', validate(idParam, 'params'), c.get);
quotesRouter.post('/', authorize('sales'), validate(createQuoteSchema), c.create);
quotesRouter.post('/:id/send', authorize('sales'), validate(idParam, 'params'), c.send);
quotesRouter.post('/:id/reject', authorize('sales'), validate(idParam, 'params'), c.reject);
quotesRouter.post('/:id/accept', authorize('sales'), validate(idParam, 'params'), c.accept);
quotesRouter.delete('/:id', authorize('sales'), validate(idParam, 'params'), c.remove);
