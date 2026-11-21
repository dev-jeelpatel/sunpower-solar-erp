import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { catalogController as c } from './catalog.controller';
import { packageSchema, productSchema } from './catalog.schema';

export const catalogRouter = Router();
catalogRouter.use(authenticate);
catalogRouter.get('/products', c.products);
catalogRouter.post('/products', authorize('warehouse'), validate(productSchema), c.createProduct);
catalogRouter.put('/products/:id', authorize('warehouse'), validate(idParam, 'params'), validate(productSchema), c.updateProduct);
catalogRouter.get('/packages', c.packages);
catalogRouter.post('/packages', authorize(), validate(packageSchema), c.createPackage);
catalogRouter.delete('/packages/:id', authorize(), validate(idParam, 'params'), c.removePackage);
