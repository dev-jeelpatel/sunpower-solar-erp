import { serial, z } from '../../lib/zod';

export const scanSchema = z.object({ serial });

export const dispatchSchema = z.object({
  vehicleNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{0,3}[ -]?\d{1,4}$/, 'Enter a valid vehicle number (e.g. GJ05AB1234)'),
});
