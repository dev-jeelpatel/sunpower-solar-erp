import { notFound, unprocessable } from '../../lib/errors';
import { logActivity, prisma, tx } from '../../lib/prisma';
import { notify } from '../../realtime/socket';
import { enquiriesRepository as repo } from './enquiries.repository';
import type { EnquiryInput, QualifyInput } from './enquiries.schema';

export const enquiriesService = {
  async create(data: EnquiryInput, source: string, userId: number | null = null) {
    const enquiry = await tx(async (db) => {
      const assignee = await repo.pickSalesperson(db);
      const row = await repo.insert(db, data, source, assignee);
      await logActivity(db, 'enquiry', row.id, 'created', userId, { source });
      return row;
    });
    notify(['sales'], 'enquiry:new', {
      title: `New enquiry: ${enquiry.customer_name} (${enquiry.requested_kw} kW)`,
      link: `/enquiries/${enquiry.id}`,
    });
    return enquiry;
  },

  list: (f: Parameters<typeof repo.list>[0]) => repo.list(f),

  async get(id: number) {
    const enquiry = await repo.findWithAssignee(id);
    if (!enquiry) throw notFound('Enquiry');
    const [surveys, quotes, activity] = await Promise.all([repo.surveysOf(id), repo.quotesOf(id), repo.activityOf(id)]);
    return { ...enquiry, surveys, quotes, activity };
  },

  /** Sales phone call: record the basics and decide whether to proceed. */
  async qualify(id: number, d: QualifyInput, userId: number) {
    return tx(async (db) => {
      const cur = await repo.lockStatus(db, id);
      if (!cur) throw notFound('Enquiry');
      if (!['new', 'contacted', 'qualified'].includes(cur.status))
        throw unprocessable(`This enquiry is already "${cur.status.replace('_', ' ')}" and can no longer be re-qualified`);

      if (d.decision === 'qualified') {
        const fields: Record<string, string> = {};
        if (d.shadowFreeSqft == null) fields.shadowFreeSqft = 'Enter the shadow-free roof area to qualify';
        if (d.monthlyBill == null) fields.monthlyBill = 'Enter the monthly electricity bill to qualify';
        if (d.gridSuitable == null) fields.gridSuitable = 'Confirm whether the grid connection is suitable';
        if (Object.keys(fields).length) throw unprocessable('Complete the checklist before qualifying', fields);
        if (d.gridSuitable === false)
          throw unprocessable('Grid connection is not suitable: mark the enquiry as "Not suitable" instead', {
            gridSuitable: 'Not suitable for grid connection',
          });
      }
      const status = { qualified: 'qualified', contacted: 'contacted', not_suitable: 'lost' }[d.decision];
      const row = await repo.saveQualification(db, id, status, d);
      await logActivity(db, 'enquiry', id, `call_logged:${d.decision}`, userId, { notes: d.notes });
      return row;
    });
  },

  async assign(id: number, userId: number, actorId: number) {
    if (!(await repo.isActiveSalesperson(userId))) throw unprocessable('Choose an active salesperson', { assignedTo: 'Not a sales user' });
    const row = await repo.assign(id, userId);
    if (!row) throw notFound('Enquiry');
    await logActivity(prisma, 'enquiry', id, 'reassigned', actorId, { to: userId });
    return row;
  },
};
