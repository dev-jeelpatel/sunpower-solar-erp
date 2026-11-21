import { notFound, unprocessable } from '../../lib/errors';
import { subsidiesRepository as repo } from './subsidies.repository';
import type { SubsidyInput } from './subsidies.schema';

/** Forward-only progress; "rejected" is allowed from any open state. */
const ORDER = ['documents_pending', 'submitted', 'approved', 'disbursed'];

export const subsidiesService = {
  list: repo.list,

  async update(id: number, d: SubsidyInput) {
    const cur = await repo.find(id);
    if (!cur) throw notFound('Subsidy application');
    if (['disbursed', 'rejected'].includes(cur.status)) throw unprocessable('This application is closed');
    if (d.status !== 'rejected' && ORDER.indexOf(d.status) < ORDER.indexOf(cur.status)) throw unprocessable('Status cannot move backwards');
    if (['submitted', 'approved', 'disbursed'].includes(d.status) && !(d.referenceNo || cur.reference_no))
      throw unprocessable('Enter the portal reference number', { referenceNo: 'Required once submitted' });
    if (['approved', 'disbursed'].includes(d.status) && d.approvedAmount == null && cur.approved_amount == null)
      throw unprocessable('Enter the approved amount', { approvedAmount: 'Required once approved' });
    return repo.update(id, d);
  },
};
