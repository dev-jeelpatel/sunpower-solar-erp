import { email, z } from '../../lib/zod';

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;
