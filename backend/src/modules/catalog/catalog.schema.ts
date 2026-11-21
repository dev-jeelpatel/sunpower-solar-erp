import { id, money, optionalText, text, z } from '../../lib/zod';

export const CATEGORIES = [
  'panel', 'inverter', 'battery', 'charge_controller', 'wiring_box', 'switch', 'earthing', 'stand', 'cable', 'connector', 'service',
] as const;

export const productSchema = z
  .object({
    sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, 'SKU: 3-30 letters, digits or dashes'),
    name: text('Name', { min: 3, max: 150 }),
    category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'Choose a category' }) }),
    trackedSerial: z.boolean().default(false),
    warrantyMonths: z.coerce.number().int().min(0).max(600).default(0),
    costPrice: money('Cost price'),
    sellPrice: money('Selling price'),
    reorderLevel: z.coerce.number().int().min(0).default(0),
  })
  .refine((p) => p.sellPrice >= p.costPrice, { path: ['sellPrice'], message: 'Selling price is below cost price' })
  .refine((p) => !(p.trackedSerial && p.category === 'service'), { path: ['trackedSerial'], message: 'Services cannot have serial numbers' });
export type ProductInput = z.infer<typeof productSchema>;

export const packageSchema = z
  .object({
    name: text('Package name', { min: 3, max: 120 }),
    kind: z.enum(['hardware', 'on_grid', 'off_grid', 'service']),
    capacityKw: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().min(1).max(5).optional()),
    description: optionalText('Description', 500),
    items: z
      .array(z.object({ productId: id('Product'), quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1') }))
      .min(1, 'A package needs at least one item'),
  })
  .refine((p) => !['on_grid', 'off_grid'].includes(p.kind) || p.capacityKw, {
    path: ['capacityKw'],
    message: 'Capacity (1-5 kW) is required for On-Grid / Off-Grid systems',
  });
export type PackageInput = z.infer<typeof packageSchema>;
