import { email, optionalPhone, password, text, z } from '../../lib/zod';

export const ROLES = ['admin', 'sales', 'technician', 'warehouse', 'support', 'director'] as const;

export const createUserSchema = z.object({
  name: text('Name', { max: 100 }),
  email,
  password,
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Choose a valid role' }) }),
  phone: optionalPhone,
  hourlyRate: z.coerce.number().min(0, 'Hourly rate cannot be negative').max(10000).default(0),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: text('Name', { max: 100 }).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  hourlyRate: z.coerce.number().min(0).max(10000).optional(),
  password: password.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
