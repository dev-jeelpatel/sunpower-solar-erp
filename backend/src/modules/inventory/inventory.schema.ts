import { id, money, optionalEmail, optionalPhone, serial, text, z } from '../../lib/zod';

export const supplierSchema = z.object({
  name: text('Supplier name', { min: 2, max: 120 }),
  phone: optionalPhone,
  email: optionalEmail,
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const poSchema = z.object({
  supplierId: id('Supplier'),
  items: z
    .array(
      z.object({
        productId: id('Product'),
        quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(100000),
        unitCost: money('Unit cost'),
      }),
    )
    .min(1, 'Add at least one item')
    .refine((a) => new Set(a.map((i) => i.productId)).size === a.length, 'Each product can appear only once'),
});
export type PoInput = z.infer<typeof poSchema>;

export const receiveSchema = z.object({
  lines: z.array(z.object({ itemId: id('Item'), serials: z.array(serial).default([]) })).min(1),
});
export type ReceiveInput = z.infer<typeof receiveSchema>;
