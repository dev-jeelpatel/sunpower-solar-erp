import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { inventoryController as c } from './inventory.controller';
import { poSchema, receiveSchema, supplierSchema } from './inventory.schema';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

inventoryRouter.get('/stock', c.stock);
inventoryRouter.get('/units', c.units);
inventoryRouter.get('/units/lookup/:serial', c.lookup);

inventoryRouter.get('/suppliers', c.suppliers);
inventoryRouter.post('/suppliers', authorize('warehouse'), validate(supplierSchema), c.createSupplier);

inventoryRouter.get('/purchases', c.purchases);
inventoryRouter.get('/purchases/:id', validate(idParam, 'params'), c.purchase);
inventoryRouter.post('/purchases', authorize('warehouse'), validate(poSchema), c.createPurchase);
inventoryRouter.post('/purchases/:id/receive', authorize('warehouse'), validate(idParam, 'params'), validate(receiveSchema), c.receive);
