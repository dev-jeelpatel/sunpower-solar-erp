import { z } from 'zod';

export { z };

// Reusable field validators with human-friendly messages -------------------

export const text = (label: string, { min = 1, max = 200 } = {}) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const optionalText = (label: string, max = 500) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `${label} must be at most ${max} characters`).optional());

export const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Please enter a valid email address (e.g. name@example.com)')
  .max(150);
export const optionalEmail = z.preprocess(blankToUndefined, email.optional());

// Indian mobile: strips spaces, dashes and +91 / 0 prefix, then expects 10 digits starting 6-9
export const phone = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '') : v),
  z
    .string({ required_error: 'Phone number is required' })
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
);
export const optionalPhone = z.preprocess(blankToUndefined, phone.optional());

export const id = (label = 'Id') =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` }).int().positive(`${label} is required`);
export const optionalId = (label = 'Id') => z.preprocess(blankToUndefined, id(label).optional());

export const money = (label: string, { min = 0 } = {}) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .min(min, `${label} cannot be less than ${min}`)
    .max(1e9, `${label} is too large`);

export const isoDate = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date (YYYY-MM-DD)`)
    .refine((s) => !Number.isNaN(Date.parse(s)), `${label} must be a valid date`);

export const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const idParam = z.object({ id: z.coerce.number().int().positive('Invalid id') });

// Serial numbers: letters, digits, dashes; normalised to upper case
export const serial = z
  .string({ required_error: 'Serial number is required' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{5,39}$/, 'Serial must be 6-40 characters: letters, digits or dashes');
