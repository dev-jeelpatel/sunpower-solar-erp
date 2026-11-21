import { addressText, optionalCity, optionalEmail, personName, phone, z } from '../../lib/zod';

export const customerSchema = z.object({
  name: personName('Name'),
  phone,
  email: optionalEmail,
  address: addressText('Address'),
  city: optionalCity,
});
export type CustomerInput = z.infer<typeof customerSchema>;
