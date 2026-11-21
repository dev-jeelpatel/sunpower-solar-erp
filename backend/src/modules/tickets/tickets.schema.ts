import { id, money, optionalText, serial, text, z } from '../../lib/zod';

const blank = (v: unknown) => (v === '' || v === null ? undefined : v);

export const createTicketSchema = z
  .object({
    serial: z.preprocess(blank, serial.optional()),
    customerId: z.preprocess(blank, id('Customer').optional()),
    subject: text('Subject', { min: 5, max: 150 }),
    faultCode: z.preprocess(blank, z.string().trim().toUpperCase().max(30).optional()),
    description: optionalText('Description', 2000),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  })
  .refine((d) => d.serial || d.customerId, { path: ['serial'], message: 'Enter the inverter/battery serial number, or pick a customer' });
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const assignSchema = z.object({ userId: id('Technician') });

export const lineSchema = z
  .object({
    productId: z.preprocess(blank, id('Product').optional()),
    description: optionalText('Description', 200),
    quantity: z.coerce.number().positive('Quantity must be greater than 0').max(1000).default(1),
    unitPrice: z.preprocess(blank, money('Unit price').optional()),
    isLabour: z.boolean().default(false),
  })
  .refine((l) => l.productId || l.description, { path: ['description'], message: 'Choose a part or describe the labour' });
export type LineInput = z.infer<typeof lineSchema>;

/** Several parts and labour lines added together; all of them are saved or none. */
export const batchLinesSchema = z.object({ lines: z.array(lineSchema).min(1, 'Add at least one line').max(20, 'Add at most 20 lines at a time') });
export type BatchLinesInput = z.infer<typeof batchLinesSchema>;

export const resolveSchema = z.object({
  resolution: text('Resolution', { min: 5, max: 1000 }),
  replacementSerial: z.preprocess(blank, serial.optional()),
});
export type ResolveInput = z.infer<typeof resolveSchema>;
