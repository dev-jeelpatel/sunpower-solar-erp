import { id, money, z } from '../../lib/zod';

export const createQuoteSchema = z.object({
  enquiryId: id('Enquiry'),
  packageId: id('Package'),
  discount: money('Discount').default(0),
  /** Chosen first in the form. If it differs from what the customer asked for, the enquiry is updated. */
  systemType: z.enum(['on_grid', 'off_grid']).optional(),
  /** Extra products on top of the package. */
  extras: z
    .array(z.object({ productId: id('Product'), quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(1000) }))
    .max(30, 'Too many extra items')
    .refine((a) => new Set(a.map((x) => x.productId)).size === a.length, 'Each extra product can be added only once')
    .default([]),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
