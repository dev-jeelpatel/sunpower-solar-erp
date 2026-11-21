import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ticketsController as c } from './tickets.controller';
import { assignSchema, createTicketSchema, lineSchema, resolveSchema } from './tickets.schema';

export const ticketsRouter = Router();
ticketsRouter.use(authenticate);
const id = validate(idParam, 'params');

ticketsRouter.get('/', c.list);
ticketsRouter.get('/:id', id, c.get);
ticketsRouter.post('/', authorize('support', 'sales'), validate(createTicketSchema), c.create);
ticketsRouter.post('/:id/assign', authorize('support'), id, validate(assignSchema), c.assign);
ticketsRouter.post('/:id/lines', authorize('support', 'technician'), id, validate(lineSchema), c.addLine);
ticketsRouter.delete('/:id/lines/:lineId', authorize('support', 'technician'), id, c.removeLine);
ticketsRouter.post('/:id/resolve', authorize('support', 'technician'), id, validate(resolveSchema), c.resolve);
ticketsRouter.post('/:id/confirm', authorize('support'), id, c.confirm);
ticketsRouter.post('/:id/reopen', authorize('support'), id, c.reopen);
