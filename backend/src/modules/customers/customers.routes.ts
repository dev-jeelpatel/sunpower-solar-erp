import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { customersController as c } from './customers.controller';
import { customerSchema } from './customers.schema';

export const customersRouter = Router();
customersRouter.get('/customers', authenticate, c.list);
customersRouter.get('/search', authenticate, c.search);
customersRouter.get('/customers/:id', authenticate, validate(idParam, 'params'), c.get);
customersRouter.post('/customers', authenticate, authorize('sales', 'support'), validate(customerSchema), c.create);
customersRouter.put('/customers/:id', authenticate, authorize('sales', 'support'), validate(idParam, 'params'), validate(customerSchema), c.update);
customersRouter.delete('/customers/:id', authenticate, authorize(), validate(idParam, 'params'), c.remove);
