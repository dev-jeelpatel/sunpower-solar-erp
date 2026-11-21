import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { customersController as c } from './customers.controller';

export const customersRouter = Router();
customersRouter.get('/customers', authenticate, c.list);
customersRouter.get('/search', authenticate, c.search);
customersRouter.get('/customers/:id', authenticate, validate(idParam, 'params'), c.get);
