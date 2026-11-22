import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { enquiriesController as c } from './enquiries.controller';
import { assignSchema, enquirySchema, qualifySchema, staffEnquirySchema } from './enquiries.schema';

// ----- Public (no login): the website enquiry form -----
export const publicRouter = Router();
const publicLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this device. Please call us instead.' },
});
publicRouter.post('/enquiries', publicLimiter, validate(enquirySchema), c.createPublic);

// ----- Staff -----
export const enquiriesRouter = Router();
enquiriesRouter.use(authenticate);
enquiriesRouter.get('/', c.list);
enquiriesRouter.post('/', authorize('sales'), validate(staffEnquirySchema), c.create);
enquiriesRouter.get('/salespeople', authorize(), c.salespeople);
enquiriesRouter.get('/:id', validate(idParam, 'params'), c.get);
enquiriesRouter.put('/:id', authorize('sales'), validate(idParam, 'params'), validate(enquirySchema), c.update);
enquiriesRouter.delete('/:id', authorize('sales'), validate(idParam, 'params'), c.remove);
enquiriesRouter.post('/:id/qualify', authorize('sales'), validate(idParam, 'params'), validate(qualifySchema), c.qualify);
enquiriesRouter.post('/:id/assign', authorize(), validate(idParam, 'params'), validate(assignSchema), c.assign);
