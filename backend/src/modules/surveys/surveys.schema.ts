import { id, isoDate, optionalText, z } from '../../lib/zod';

export const scheduleSurveySchema = z.object({
  enquiryId: id('Enquiry'),
  technicianId: id('Technician'),
  scheduledDate: isoDate('Survey date').refine((d) => d >= new Date().toISOString().slice(0, 10), 'Survey date cannot be in the past'),
});
export type ScheduleSurveyInput = z.infer<typeof scheduleSurveySchema>;

export const completeSurveySchema = z.object({
  roofDirection: z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], { errorMap: () => ({ message: 'Choose the roof direction' }) }),
  roofTiltDeg: z.coerce.number({ invalid_type_error: 'Enter the roof tilt in degrees' }).min(0, 'Tilt must be 0-90°').max(90, 'Tilt must be 0-90°'),
  cableDistanceM: z.coerce.number({ invalid_type_error: 'Enter the cable distance in metres' }).min(0, 'Cannot be negative').max(500, 'Cable distance looks too large'),
  usableAreaSqft: z.coerce.number({ invalid_type_error: 'Enter the usable roof area' }).positive('Must be greater than 0').max(100000),
  suggestedSystemType: z.enum(['on_grid', 'off_grid', 'none'], { errorMap: () => ({ message: 'Choose on-grid, off-grid or neither' }) }),
  suggestionReason: optionalText('Reason', 500),
  notes: optionalText('Notes', 1000),
});
export type CompleteSurveyInput = z.infer<typeof completeSurveySchema>;

export const reviewSurveySchema = z.object({
  decision: z.enum(['approve', 'reject'], { errorMap: () => ({ message: 'Choose approve or reject' }) }),
  notes: optionalText('Notes', 500),
  /** Sales can keep what the customer asked for, or switch to what the technician suggests. */
  systemType: z.enum(['on_grid', 'off_grid']).optional(),
});
export type ReviewSurveyInput = z.infer<typeof reviewSurveySchema>;
