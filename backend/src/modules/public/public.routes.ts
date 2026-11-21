import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { notFound, unprocessable } from '../../lib/errors';
import { wrap } from '../../lib/http';
import { phone, z } from '../../lib/zod';
import { validate } from '../../middleware/validate';
import { checkCode, issueCode, OTP_TTL_SECONDS } from './otp.service';
import { publicRepository as repo } from './public.repository';

/** Read-only endpoints for the customer website (no login). */
export const websiteRouter = Router();

const limiter = (max: number, minutes: number, message: string) =>
  rateLimit({ windowMs: minutes * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { error: message } });

const lookupLimiter = limiter(30, 15, 'Too many lookups from this device. Please try again in a few minutes.');
const otpRequestLimiter = limiter(6, 60, 'Too many code requests from this device. Please try again in an hour.');
const otpVerifyLimiter = limiter(20, 15, 'Too many attempts from this device. Please try again in a few minutes.');

websiteRouter.get('/packages', wrap(async (_req, res) => res.json(await repo.packages())));

// ----- Warranty by serial number -----
websiteRouter.get(
  '/warranty/:serial',
  lookupLimiter,
  wrap(async (req, res) => {
    const serial = String(req.params.serial).trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{5,39}$/.test(serial)) throw notFound('Serial number');
    const unit = await repo.warranty(serial);
    if (!unit) throw notFound('Serial number');
    res.json(unit);
  }),
);

// ----- Warranty by mobile number (verified with a one-time code) -----
const requestSchema = z.object({ phone });
const verifySchema = z.object({ phone, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

/**
 * Step 1: ask for a code. The answer is the same whether or not the number is registered, so the form
 * cannot be used to discover which numbers are customers. In demo mode the code is returned for registered numbers.
 */
websiteRouter.post(
  '/warranty/otp',
  otpRequestLimiter,
  validate(requestSchema),
  wrap(async (req, res) => {
    const customer = await repo.customerByPhone(req.body.phone);
    let demoCode: string | undefined;
    if (customer) demoCode = (await issueCode(req.body.phone)).demoCode;
    res.json({
      ok: true,
      message: 'If this number has a SunPower order, a 6-digit code has been sent to it by SMS.',
      expiresInSeconds: OTP_TTL_SECONDS,
      ...(demoCode ? { demoCode } : {}),
    });
  }),
);

/** Step 2: check the code and return the customer's equipment and warranty status. */
websiteRouter.post(
  '/warranty/verify',
  otpVerifyLimiter,
  validate(verifySchema),
  wrap(async (req, res) => {
    const { phone: number, code } = req.body;
    const customer = await repo.customerByPhone(number);
    if (!customer || !checkCode(number, code)) throw unprocessable('That code is not correct or has expired. Please request a new one.', { code: 'Incorrect or expired code' });
    const units = await repo.unitsOfCustomer(customer.id);
    res.json({ customerName: customer.name.split(' ')[0], units });
  }),
);
