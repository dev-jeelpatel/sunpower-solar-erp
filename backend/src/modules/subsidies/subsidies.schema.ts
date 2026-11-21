import { isoDate, money, optionalText, z } from '../../lib/zod';

const blank = (v: unknown) => (v === '' || v === null ? undefined : v);

export const subsidySchema = z.object({
  status: z.enum(['documents_pending', 'submitted', 'approved', 'disbursed', 'rejected']),
  referenceNo: optionalText('Reference number', 60),
  submittedAt: z.preprocess(blank, isoDate('Submission date').optional()),
  approvedAmount: z.preprocess(blank, money('Approved amount').optional()),
  notes: optionalText('Notes', 500),
});
export type SubsidyInput = z.infer<typeof subsidySchema>;
