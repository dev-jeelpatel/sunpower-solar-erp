import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { usersController } from './users.controller';
import { createUserSchema, updateUserSchema } from './users.schema';

export const usersRouter = Router();
usersRouter.use(authenticate);

// Everyone signed in can list staff by role (needed to assign work); only admin can modify.
usersRouter.get('/', usersController.list);
usersRouter.get('/all', authorize(), usersController.listAll);
usersRouter.post('/', authorize(), validate(createUserSchema), usersController.create);
usersRouter.patch('/:id', authorize(), validate(idParam, 'params'), validate(updateUserSchema), usersController.update);
usersRouter.delete('/:id', authorize(), validate(idParam, 'params'), usersController.remove);
