import { z } from 'zod';

export { z };

// Reusable field validators with human-friendly messages -------------------

const MARKUP = /[<>]/;
const collapse = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v);

export const text = (label: string, { min = 1, max = 200 } = {}) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`)
    .refine((v) => !MARKUP.test(v), `${label} cannot contain < or >`);

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const optionalText = (label: string, max = 500) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max, `${label} must be at most ${max} characters`).refine((v) => !MARKUP.test(v), `${label} cannot contain < or >`).optional(),
  );

/** A person's name: letters, spaces and . ' - only, starting with a letter. No digits or symbols. */
export const personName = (label = 'Name') =>
  z.preprocess(
    collapse,
    z
      .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
      .min(2, `${label} must be at least 2 characters`)
      .max(60, `${label} must be at most 60 characters`)
      .regex(/^\p{L}[\p{L} .'-]*$/u, `${label} can contain only letters, spaces and . ' -`),
  );

/** A city or town name. Optional. */
export const optionalCity = z.preprocess(
  (v) => (v === '' || v === null ? undefined : collapse(v)),
  z.string().min(2, 'City must be at least 2 characters').max(60, 'City must be at most 60 characters').regex(/^\p{L}[\p{L} .'-]*$/u, "City can contain only letters, spaces and . ' -").optional(),
);

/** Postal address: letters, digits and , . - / # ( ) & ' with at least one real word. */
export const addressText = (label = 'Address') =>
  z.preprocess(
    collapse,
    z
      .string({ required_error: `${label} is required` })
      .min(8, `${label} must be at least 8 characters`)
      .max(200, `${label} must be at most 200 characters`)
      .regex(/^[\p{L}\p{N} ,./#()&'-]+$/u, `${label} has characters that are not allowed. Use letters, numbers and , . - / # ( )`)
      .regex(/\p{L}{3,}/u, `${label} must include a street, area or building name`),
  );

/** A company name: letters and digits plus . , & ' - ( ) */
export const businessName = (label = 'Name') =>
  z.preprocess(
    collapse,
    z.string({ required_error: `${label} is required` }).min(2, `${label} must be at least 2 characters`).max(120, `${label} must be at most 120 characters`)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} .,&'()-]*$/u, `${label} has characters that are not allowed`),
  );

export const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(100, 'Email must be at most 100 characters')
  .regex(/^[a-z0-9]+([._+-][a-z0-9]+)*@[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.[a-z]{2,}$/, 'Please enter a valid email address (e.g. name@example.com)');
export const optionalEmail = z.preprocess(blankToUndefined, email.optional());

// Indian mobile: strips spaces, dashes and +91 / 0 prefix, then expects 10 digits starting 6-9
export const phone = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '') : v),
  z
    .string({ required_error: 'Phone number is required' })
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
    .refine((v) => !/^(\d){9}$/.test(v) && !/(\d){6}/.test(v), 'This number does not look real. Please check it'),
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
