import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { claimsController as c } from './claims.controller';
import { assignClaimSchema, decisionSchema, fileClaimSchema, fulfilSchema, inspectionSchema, rmaSchema, withdrawSchema } from './claims.schema';

export const claimsRouter = Router();
claimsRouter.use(authenticate);
const id = validate(idParam, 'params');

claimsRouter.get('/', c.list);
claimsRouter.get('/stats', c.stats);
claimsRouter.get('/:id', id, c.get);
claimsRouter.post('/', authorize('support'), validate(fileClaimSchema), c.file);
claimsRouter.post('/:id/assign', authorize('support'), id, validate(assignClaimSchema), c.assign);
claimsRouter.post('/:id/inspection', authorize('technician'), id, validate(inspectionSchema), c.inspect);
claimsRouter.post('/:id/decision', authorize('support'), id, validate(decisionSchema), c.decide);
claimsRouter.post('/:id/fulfil', authorize('support', 'warehouse'), id, validate(fulfilSchema), c.fulfil);
claimsRouter.post('/:id/supplier-return', authorize('warehouse'), id, validate(rmaSchema), c.rma);
claimsRouter.post('/:id/close', authorize('support'), id, c.close);
claimsRouter.post('/:id/withdraw', authorize('support'), id, validate(withdrawSchema), c.withdraw);
