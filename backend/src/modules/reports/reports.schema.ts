import { z } from '../../lib/zod';

export const monthSchema = z.object({
  month: z.string({ required_error: 'Month is required' }).regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
});
