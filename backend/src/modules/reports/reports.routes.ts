import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { reportsController as c } from './reports.controller';
import { monthSchema } from './reports.schema';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.get('/dashboard', c.dashboard);

// Reports below are for management only (director, plus admin which always passes)
const mgmt = authorize('director');
reportsRouter.get('/profitability', mgmt, c.profitability);
reportsRouter.get('/unfinished', mgmt, c.unfinished);
reportsRouter.get('/export/:type.csv', mgmt, c.exportCsv);
reportsRouter.get('/payouts', mgmt, validate(monthSchema, 'query'), c.payouts);
reportsRouter.post('/payouts/generate', mgmt, validate(monthSchema), c.generatePayouts);
reportsRouter.post('/payouts/:id/pay', mgmt, validate(idParam, 'params'), c.pay);
