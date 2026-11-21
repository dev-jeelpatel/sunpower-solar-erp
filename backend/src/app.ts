import fs from 'node:fs';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { openApiSpec } from './docs/openapi';
import { prisma } from './lib/prisma';
import { authenticate } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { enquiriesRouter, publicRouter } from './modules/enquiries/enquiries.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { quotesRouter } from './modules/quotes/quotes.routes';
import { invoicesRouter } from './modules/invoices/invoices.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { surveysRouter } from './modules/surveys/surveys.routes';
import { dispatchRouter } from './modules/dispatch/dispatch.routes';
import { jobsRouter } from './modules/jobs/jobs.routes';
import { subsidiesRouter } from './modules/subsidies/subsidies.routes';
import { ticketsRouter } from './modules/tickets/tickets.routes';
import { claimsRouter } from './modules/claims/claims.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { scheduleRouter } from './modules/schedule/schedule.routes';
import { websiteRouter } from './modules/public/public.routes';
import { usersRouter } from './modules/users/users.routes';
import { availabilityRouter } from './modules/availability/availability.routes';

fs.mkdirSync(env.uploadDir, { recursive: true });

export const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Job photos are served only to signed-in users (token via Authorization header or ?token for <img>)
app.use(
  '/uploads',
  (req, _res, next) => {
    if (req.query.token && !req.headers.authorization) req.headers.authorization = `Bearer ${String(req.query.token)}`;
    next();
  },
  authenticate,
  express.static(env.uploadDir, { index: false, dotfiles: 'deny' }),
);

app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok' });
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'SunPower API docs' }));

app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api/public', websiteRouter);
app.use('/api/users', usersRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/enquiries', enquiriesRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api', customersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/surveys', surveysRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/dispatches', dispatchRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/subsidies', subsidiesRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/schedule', scheduleRouter);

app.use(notFoundHandler);
app.use(errorHandler);
