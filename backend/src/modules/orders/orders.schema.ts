import { id, isoDate, z } from '../../lib/zod';

export const scheduleSchema = z.object({
  technicianIds: z.array(id('Technician')).min(1, 'Choose at least one technician').max(6),
  scheduledDate: isoDate('Installation date'),
});
export type ScheduleInput = z.infer<typeof scheduleSchema>;
