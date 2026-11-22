import { notify, notifyUsers } from '../../realtime/socket';
import { forbidden, notFound, unprocessable } from '../../lib/errors';
import type { AuthUser } from '../../lib/http';
import { exec, logActivity, q1, tx } from '../../lib/prisma';
import { availabilityService } from '../availability/availability.service';
import { surveysRepository as repo } from './surveys.repository';
import type { CompleteSurveyInput, ReviewSurveyInput, ScheduleSurveyInput } from './surveys.schema';

export const surveysService = {
  /** Technicians only see their own surveys. */
  list: (user: AuthUser, status: string | null) => repo.list(user.role === 'technician' ? user.id : null, status),

  /** Sales books a technician for the roof visit. */
  schedule(d: ScheduleSurveyInput, userId: number) {
    return tx(async (db) => {
      const enq = await repo.lockEnquiryStatus(db, d.enquiryId);
      if (!enq) throw notFound('Enquiry');
      if (enq.status !== 'qualified')
        throw unprocessable('Only enquiries that passed the phone check can be sent for a survey. Qualify the enquiry first.');
      if (!(await repo.isActiveTechnician(db, d.technicianId)))
        throw unprocessable('Choose an active technician', { technicianId: 'Not a technician' });
      await availabilityService.assertFree(db, d.technicianId, d.scheduledDate);
      const survey = await repo.insert(db, d.enquiryId, d.technicianId, d.scheduledDate);
      await repo.setEnquiryStatus(db, d.enquiryId, 'survey_scheduled');
      await logActivity(db, 'enquiry', d.enquiryId, 'survey_scheduled', userId, { technicianId: d.technicianId, scheduledDate: d.scheduledDate });
      return survey;
    }).then((survey) => {
      notifyUsers([d.technicianId], 'survey:scheduled', { title: `New site survey for you on ${d.scheduledDate}`, link: '/surveys' });
      return survey;
    });
  },

  /** Technician submits the roof measurements. */
  complete(id: number, d: CompleteSurveyInput, user: AuthUser) {
    return tx(async (db) => {
      const s = await repo.lock(db, id);
      if (!s) throw notFound('Survey');
      if (user.role === 'technician' && s.technician_id !== user.id) throw forbidden('This survey is assigned to another technician');
      if (s.status !== 'scheduled') throw unprocessable('This survey has already been submitted');
      const row = await repo.complete(db, id, d);
      await logActivity(db, 'enquiry', s.enquiry_id, 'survey_submitted', user.id, { suggested: d.suggestedSystemType });
      return { row, enquiryId: s.enquiry_id as number };
    }).then(({ row, enquiryId }) => {
      notify(['sales'], 'survey:submitted', { title: 'A site survey was submitted and needs your review', link: `/enquiries/${enquiryId}` });
      return row;
    });
  },

  /** Sales / admin approves or rejects. Approval unlocks quoting. */
  review(id: number, d: ReviewSurveyInput, userId: number) {
    return tx(async (db) => {
      const s = await repo.lock(db, id);
      if (!s) throw notFound('Survey');
      if (s.status !== 'completed') throw unprocessable('Only submitted surveys can be reviewed');
      const approve = d.decision === 'approve';
      const row = await repo.review(db, id, approve ? 'approved' : 'rejected', userId, d.notes ?? null);
      if (approve && d.systemType) {
        const cur = await q1<{ system_type: string }>(db, 'SELECT system_type FROM enquiries WHERE id = $1', [s.enquiry_id]);
        if (cur && cur.system_type !== d.systemType) {
          await exec(db, 'UPDATE enquiries SET system_type = $2::system_type WHERE id = $1', [s.enquiry_id, d.systemType]);
          await logActivity(db, 'enquiry', s.enquiry_id, 'system_type_changed', userId, { from: cur.system_type, to: d.systemType });
        }
      }
      // Rejected: back to "qualified" so a fresh visit can be booked
      await repo.setEnquiryStatus(db, s.enquiry_id, approve ? 'survey_approved' : 'qualified');
      await logActivity(db, 'enquiry', s.enquiry_id, approve ? 'survey_approved' : 'survey_rejected', userId, { notes: d.notes });
      return row;
    });
  },
};
