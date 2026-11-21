import { optionalText, text, z } from '../../lib/zod';

export const completeJobSchema = z.object({
  startedAt: z.string({ required_error: 'Start time is required' }).datetime({ offset: true, message: 'Enter a valid start time' }),
  finishedAt: z.string({ required_error: 'Finish time is required' }).datetime({ offset: true, message: 'Enter a valid finish time' }),
  confirmedKw: z.coerce
    .number({ invalid_type_error: 'Enter the installed system size in kW' })
    .min(0.5, 'Minimum is 0.5 kW')
    .max(10, 'Maximum is 10 kW'),
  notes: optionalText('Notes', 1000),
  signerName: text('Customer name', { min: 2, max: 100 }),
  signature: z
    .string({ required_error: 'Customer signature is required' })
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Customer signature is required')
    .max(700000, 'Signature image is too large'),
});
export type CompleteJobInput = z.infer<typeof completeJobSchema>;
