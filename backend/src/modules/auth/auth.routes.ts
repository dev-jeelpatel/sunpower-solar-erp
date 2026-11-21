import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { authController } from './auth.controller';
import { loginSchema } from './auth.schema';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again in a few minutes.' },
});

export const authRouter = Router();
authRouter.post('/login', loginLimiter, validate(loginSchema), authController.login);
authRouter.get('/me', authenticate, authController.me);
