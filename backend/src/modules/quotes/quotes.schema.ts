import { id, money, z } from '../../lib/zod';

export const createQuoteSchema = z.object({
  enquiryId: id('Enquiry'),
  packageId: id('Package'),
  discount: money('Discount').default(0),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
