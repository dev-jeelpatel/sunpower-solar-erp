import { money, optionalText, z } from '../../lib/zod';

export const paySchema = z.object({
  amount: money('Amount', { min: 0.01 }),
  method: z.enum(['cash', 'upi', 'bank_transfer', 'cheque', 'card'], { errorMap: () => ({ message: 'Choose a payment method' }) }),
  reference: optionalText('Reference', 80),
});
export type PayInput = z.infer<typeof paySchema>;
