import { id, isoDate, optionalText, serial, text, z } from '../../lib/zod';

const blank = (v: unknown) => (v === '' || v === null ? undefined : v);

export const CAUSES = ['manufacturing_defect', 'installation_fault', 'wear_and_tear', 'physical_damage', 'misuse', 'power_surge', 'other'] as const;

export const fileClaimSchema = z.object({
  serial,
  issue: text('Problem description', { min: 10, max: 1500 }),
  faultCode: z.preprocess(blank, z.string().trim().toUpperCase().max(30).optional()),
  ticketId: z.preprocess(blank, id('Ticket').optional()),
});
export type FileClaimInput = z.infer<typeof fileClaimSchema>;

export const assignClaimSchema = z.object({
  technicianId: id('Technician'),
  visitDate: isoDate('Visit date').refine((d) => d >= new Date().toISOString().slice(0, 10), 'Visit date cannot be in the past'),
});
export type AssignClaimInput = z.infer<typeof assignClaimSchema>;

export const inspectionSchema = z.object({
  findings: text('Findings', { min: 10, max: 1500 }),
  cause: z.enum(CAUSES, { errorMap: () => ({ message: 'Choose the cause you found' }) }),
  recommendation: z.enum(['repair', 'replace', 'no_fault'], { errorMap: () => ({ message: 'Choose what you recommend' }) }),
});
export type InspectionInput = z.infer<typeof inspectionSchema>;

export const decisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject'], { errorMap: () => ({ message: 'Choose approve or reject' }) }),
    remedy: z.preprocess(blank, z.enum(['repair', 'replace']).optional()),
    notes: text('Notes', { min: 5, max: 1000 }),
    goodwill: z.boolean().default(false),
  })
  .refine((d) => d.decision === 'reject' || d.remedy, { path: ['remedy'], message: 'Choose repair or replacement' })
  .refine((d) => d.decision === 'approve' || d.notes.length >= 10, { path: ['notes'], message: 'Explain the reason for rejecting (at least 10 characters)' });
export type DecisionInput = z.infer<typeof decisionSchema>;

export const fulfilSchema = z.object({
  replacementSerial: z.preprocess(blank, serial.optional()),
  repairCost: z.preprocess(blank, z.coerce.number().min(0, 'Cost cannot be negative').max(10000000, 'Cost is too large').optional()),
  notes: optionalText('Notes', 1000),
});
export type FulfilInput = z.infer<typeof fulfilSchema>;

export const rmaSchema = z.object({
  status: z.enum(['sent', 'credited'], { errorMap: () => ({ message: 'Choose sent or credited' }) }),
  reference: z.preprocess(blank, z.string().trim().max(60).optional()),
  credit: z.preprocess(blank, z.coerce.number().min(0, 'Credit cannot be negative').max(100000000).optional()),
});
export type RmaInput = z.infer<typeof rmaSchema>;

export const withdrawSchema = z.object({ reason: text('Reason', { min: 5, max: 500 }) });
