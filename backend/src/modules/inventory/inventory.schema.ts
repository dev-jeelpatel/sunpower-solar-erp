import { businessName, id, money, optionalEmail, optionalPhone, serial, text, z } from '../../lib/zod';

export const supplierSchema = z.object({
  name: businessName('Supplier name'),
  phone: optionalPhone,
  email: optionalEmail,
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const addUnitsSchema = z.object({
  productId: id('Product'),
  serials: z.array(serial).min(1, 'Enter at least one serial number').max(500),
});
export type AddUnitsInput = z.infer<typeof addUnitsSchema>;

export const adjustSchema = z.object({
  productId: id('Product'),
  change: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole numbers only').refine((n) => n !== 0, 'Enter how many to add or remove').refine((n) => Math.abs(n) <= 100000, 'That is too many'),
  reason: z.string().trim().min(3, 'Give a short reason, e.g. "Stock count correction"').max(200),
});
export type AdjustInput = z.infer<typeof adjustSchema>;

export const renameUnitSchema = z.object({ serial });

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
