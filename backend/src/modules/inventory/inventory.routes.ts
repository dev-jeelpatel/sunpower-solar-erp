import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { inventoryController as c } from './inventory.controller';
import { addUnitsSchema, poSchema, renameUnitSchema, receiveSchema, supplierSchema } from './inventory.schema';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

inventoryRouter.get('/stock', c.stock);
inventoryRouter.get('/units', c.units);
inventoryRouter.get('/units/lookup/:serial', c.lookup);

inventoryRouter.get('/suppliers', c.suppliers);
inventoryRouter.post('/suppliers', authorize('warehouse'), validate(supplierSchema), c.createSupplier);

inventoryRouter.put('/suppliers/:id', authorize('warehouse'), validate(idParam, 'params'), validate(supplierSchema), c.updateSupplier);
inventoryRouter.delete('/suppliers/:id', authorize('warehouse'), validate(idParam, 'params'), c.removeSupplier);

inventoryRouter.post('/units', authorize('warehouse'), validate(addUnitsSchema), c.addUnits);
inventoryRouter.put('/units/:id', authorize('warehouse'), validate(idParam, 'params'), validate(renameUnitSchema), c.renameUnit);
inventoryRouter.delete('/units/:id', authorize('warehouse'), validate(idParam, 'params'), c.removeUnit);

inventoryRouter.get('/purchases', c.purchases);
inventoryRouter.post('/purchases/:id/cancel', authorize('warehouse'), validate(idParam, 'params'), c.cancelPurchase);
inventoryRouter.get('/purchases/:id', validate(idParam, 'params'), c.purchase);
inventoryRouter.post('/purchases', authorize('warehouse'), validate(poSchema), c.createPurchase);
inventoryRouter.post('/purchases/:id/receive', authorize('warehouse'), validate(idParam, 'params'), validate(receiveSchema), c.receive);
