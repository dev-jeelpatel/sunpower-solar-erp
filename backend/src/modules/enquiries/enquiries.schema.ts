import { addressText, id, money, optionalCity, optionalEmail, optionalText, personName, phone, z } from '../../lib/zod';

export const enquirySchema = z.object({
  name: personName('Name'),
  phone,
  email: optionalEmail,
  address: addressText('Address'),
  city: optionalCity,
  requestedKw: z.coerce
    .number({ invalid_type_error: 'Choose the system size' })
    .min(1, 'Minimum system size is 1 kW')
    .int('System size must be a whole number of kW')
    .max(5, 'Maximum system size is 5 kW'),
  systemType: z.enum(['on_grid', 'off_grid'], { errorMap: () => ({ message: 'Choose On-Grid or Off-Grid' }) }),
  subsidyRequired: z.boolean().optional(),
  message: optionalText('Message', 1000),
});
export type EnquiryInput = z.infer<typeof enquirySchema>;

export const staffEnquirySchema = enquirySchema.extend({
  source: z.enum(['web', 'whatsapp', 'call', 'walk_in']).default('call'),
});

const blank = (v: unknown) => (v === '' || v === null ? undefined : v);

export const qualifySchema = z.object({
  decision: z.enum(['qualified', 'contacted', 'not_suitable'], { errorMap: () => ({ message: 'Choose an outcome' }) }),
  shadowFreeSqft: z.preprocess(blank, z.coerce.number().positive('Must be greater than 0').max(100000).optional()),
  monthlyBill: z.preprocess(blank, money('Monthly bill').optional()),
  gridSuitable: z.boolean().optional(),
  notes: optionalText('Notes', 1000),
});
export type QualifyInput = z.infer<typeof qualifySchema>;

export const assignSchema = z.object({ assignedTo: id('Salesperson') });
