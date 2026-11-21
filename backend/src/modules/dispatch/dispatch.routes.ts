import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { dispatchController as c } from './dispatch.controller';
import { dispatchSchema, scanSchema } from './dispatch.schema';

export const dispatchRouter = Router();
dispatchRouter.use(authenticate);
const warehouse = authorize('warehouse');

dispatchRouter.get('/', c.list);
dispatchRouter.get('/:id', validate(idParam, 'params'), c.get);
dispatchRouter.post('/:id/scan', warehouse, validate(idParam, 'params'), validate(scanSchema), c.scan);
dispatchRouter.delete('/:id/scan/:serial', warehouse, validate(idParam, 'params'), c.unscan);
dispatchRouter.post('/:id/dispatch', warehouse, validate(idParam, 'params'), validate(dispatchSchema), c.dispatch);
dispatchRouter.post('/:id/deliver', authorize('warehouse', 'technician'), validate(idParam, 'params'), c.deliver);
