import { Router } from 'express';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { surveysController as c } from './surveys.controller';
import { completeSurveySchema, reviewSurveySchema, scheduleSurveySchema } from './surveys.schema';

export const surveysRouter = Router();
surveysRouter.use(authenticate);
surveysRouter.get('/', c.list);
surveysRouter.post('/', authorize('sales'), validate(scheduleSurveySchema), c.schedule);
surveysRouter.post('/:id/complete', authorize('technician'), validate(idParam, 'params'), validate(completeSurveySchema), c.complete);
surveysRouter.post('/:id/review', authorize('sales'), validate(idParam, 'params'), validate(reviewSurveySchema), c.review);
