import { optionalEmail, optionalText, phone, text, z } from '../../lib/zod';

export const customerSchema = z.object({
  name: text('Name', { min: 2, max: 120 }),
  phone,
  email: optionalEmail,
  address: text('Address', { min: 5, max: 300 }),
  city: optionalText('City', 80),
});
export type CustomerInput = z.infer<typeof customerSchema>;
