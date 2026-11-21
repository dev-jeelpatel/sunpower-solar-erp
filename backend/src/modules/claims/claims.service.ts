import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import type { AuthUser } from '../../lib/http';
import { logActivity, tx } from '../../lib/prisma';
import { today } from '../../lib/utils';
import { notify, notifyUsers } from '../../realtime/socket';
import { availabilityService } from '../availability/availability.service';
import { claimsRepository as repo } from './claims.repository';
import type { AssignClaimInput, DecisionInput, FileClaimInput, FulfilInput, InspectionInput, RmaInput } from './claims.schema';

const LIVE = ['filed', 'inspecting', 'inspected', 'approved', 'fulfilled'];

export const claimsService = {
  /** Technicians only see the claims they were sent to inspect. */
  list: (user: AuthUser, f: { status: string | null; q: string | null; limit: number; offset: number }) =>
    repo.list({ ...f, technicianId: user.role === 'technician' ? user.id : null }),
  stats: repo.stats,

  async get(id: number, user?: AuthUser) {
    const claim = await repo.findDetailed(id);
    if (!claim) throw notFound('Claim');
    if (user?.role === 'technician' && claim.technician_id !== user.id) throw forbidden('This claim is assigned to another technician');
    return { ...claim, timeline: await repo.timeline(id) };
  },

  /** Step 1. File a claim against a delivered unit. Eligibility (is the warranty still valid) is checked and recorded. */
  async file(d: FileClaimInput, userId: number) {
    const id = await tx(async (db) => {
      const unit = await repo.unitBySerial(db, d.serial);
      if (!unit) throw unprocessable('No unit with that serial number was found', { serial: 'Unknown serial number' });
      if (unit.status === 'faulty') throw unprocessable('This unit was already replaced and is marked faulty', { serial: 'Already replaced' });
      if (unit.status !== 'delivered' || !unit.customer_id) throw unprocessable('Only a delivered unit can be claimed', { serial: 'Unit is not delivered to a customer' });
      const live = await repo.liveClaimOnUnit(db, unit.id);
      if (live) throw conflict(`This unit already has an open claim (${live.claim_no})`, { serial: `Open claim ${live.claim_no}` });
      let ticketId: number | null = null;
      if (d.ticketId) {
        const t = await repo.ticket(db, d.ticketId);
        if (!t || t.customer_id !== unit.customer_id) throw unprocessable('That ticket belongs to a different customer', { ticketId: 'Ticket does not match this unit' });
        ticketId = t.id;
      }
      const end = unit.warranty_end ? String(unit.warranty_end).slice(0, 10) : null;
      const covered = !!end && end >= today();
      const row = await repo.insert(db, {
        customerId: unit.customer_id, unitId: unit.id, ticketId, issue: d.issue, faultCode: d.faultCode ?? null, covered, warrantyEnd: end, userId,
      });
      await logActivity(db, 'claim', row!.id, 'filed', userId, { covered, serial: unit.serial_no });
      return row!.id;
    });
    const c: Record<string, any> = await this.get(id);
    notify(['support'], 'ticket:new', { title: `Warranty claim ${c.claim_no} filed for ${c.customer_name} (${c.covered ? 'in warranty' : 'warranty ended'})`, link: `/claims/${id}` });
    return c;
  },

  /** Step 2. Send a technician to inspect, on a day they are free. */
  async assign(id: number, d: AssignClaimInput, userId: number) {
    await tx(async (db) => {
      const c = await repo.lock(db, id);
      if (!c) throw notFound('Claim');
      if (!['filed', 'inspecting'].includes(c.status)) throw unprocessable(`This claim is ${c.status} and can no longer be sent for inspection`);
      if (!(await repo.isActiveTechnician(db, d.technicianId))) throw unprocessable('Choose an active technician', { technicianId: 'Not a technician' });
      await availabilityService.assertFree(db, d.technicianId, d.visitDate, null, id);
      await repo.assign(db, id, d.technicianId, d.visitDate);
      await logActivity(db, 'claim', id, 'inspection_booked', userId, { technicianId: d.technicianId, visitDate: d.visitDate });
    });
    const c: Record<string, any> = await this.get(id);
    notifyUsers([d.technicianId], 'job:scheduled', { title: `Warranty inspection for you: ${c.customer_name} on ${d.visitDate}`, link: `/claims/${id}` });
    return c;
  },

  /** Step 3. The technician reports what they found. */
  async inspect(id: number, d: InspectionInput, user: AuthUser) {
    await tx(async (db) => {
      const c = await repo.lock(db, id);
      if (!c) throw notFound('Claim');
      if (c.status !== 'inspecting') throw unprocessable('This claim is not waiting for an inspection report');
      if (user.role === 'technician' && c.technician_id !== user.id) throw forbidden('This inspection is assigned to another technician');
      await repo.inspect(db, id, d);
      await logActivity(db, 'claim', id, 'inspected', user.id, { cause: d.cause, recommendation: d.recommendation });
    });
    notify(['support'], 'survey:submitted', { title: `Inspection report ready for a decision`, link: `/claims/${id}` });
    return this.get(id);
  },

  /**
   * Step 4. Approve (repair or replace) or reject with a reason.
   * An out-of-warranty claim can only be approved as goodwill, and only by an admin.
   */
  async decide(id: number, d: DecisionInput, user: AuthUser) {
    await tx(async (db) => {
      const c = await repo.lock(db, id);
      if (!c) throw notFound('Claim');
      if (d.decision === 'reject') {
        if (!['filed', 'inspecting', 'inspected'].includes(c.status)) throw unprocessable(`This claim is ${c.status} and can no longer be rejected`);
        await repo.reject(db, id, user.id, d.notes);
        await logActivity(db, 'claim', id, 'rejected', user.id, { notes: d.notes });
        return;
      }
      if (c.status !== 'inspected') throw unprocessable('Approve only after the technician has submitted the inspection report');
      let goodwill = false;
      if (!c.covered) {
        if (!d.goodwill) throw unprocessable('The warranty had ended when this claim was filed. Reject it, or approve it as goodwill.', { goodwill: 'Warranty ended' });
        if (user.role !== 'admin') throw forbidden('Only an admin can approve a claim as goodwill after the warranty has ended');
        goodwill = true;
      }
      if (c.recommendation === 'no_fault' && d.notes.length < 15) throw unprocessable('The inspection found no fault. Explain why you are approving anyway (at least 15 characters).', { notes: 'Explain the approval' });
      await repo.approve(db, id, user.id, d.remedy!, d.notes, goodwill);
      await logActivity(db, 'claim', id, goodwill ? 'approved_goodwill' : 'approved', user.id, { remedy: d.remedy });
    });
    return this.get(id);
  },

  /** Step 5. Do the repair or hand over the replacement. A replacement keeps the warranty that was left. */
  async fulfil(id: number, d: FulfilInput, userId: number) {
    await tx(async (db) => {
      const c = await repo.lock(db, id);
      if (!c) throw notFound('Claim');
      if (c.status !== 'approved') throw unprocessable('Only an approved claim can be fulfilled');
      let replacementId: number | null = null;
      let rma = 'none';
      if (c.remedy === 'replace') {
        if (!d.replacementSerial) throw unprocessable('Enter the serial number of the replacement unit', { replacementSerial: 'Replacement serial is required' });
        const old = await repo.unitById(db, c.unit_id);
        const fresh = await repo.lockUnitBySerial(db, d.replacementSerial);
        if (!fresh) throw unprocessable('Replacement serial not found', { replacementSerial: 'Unknown serial number' });
        if (fresh.status !== 'in_stock') throw unprocessable('That unit is not in stock', { replacementSerial: 'Unit is not in stock' });
        if (fresh.product_id !== old!.product_id) throw unprocessable('The replacement must be the same product model', { replacementSerial: 'Different product model' });
        await repo.markFaulty(db, old!.id);
        await repo.installReplacement(db, fresh.id, old!);
        await repo.stockOut(db, fresh.product_id, id, userId);
        replacementId = fresh.id;
        rma = 'pending';
      } else if (d.replacementSerial) {
        throw unprocessable('This claim was approved as a repair, so no replacement unit is needed', { replacementSerial: 'Not needed for a repair' });
      }
      if (c.remedy === 'repair' && !d.notes) throw unprocessable('Describe the repair that was done', { notes: 'Notes are required for a repair' });
      await repo.fulfil(db, id, userId, replacementId, d.repairCost ?? 0, d.notes ?? null, rma);
      await logActivity(db, 'claim', id, c.remedy === 'replace' ? 'replaced' : 'repaired', userId, { replacementId });
    });
    return this.get(id);
  },

  /** Track the faulty unit going back to the supplier and the credit that comes back. */
  async rma(id: number, d: RmaInput, userId: number) {
    await tx(async (db) => {
      const c = await repo.lock(db, id);
      if (!c) throw notFound('Claim');
      if (c.remedy !== 'replace' || c.rma === 'none') throw unprocessable('Only a replaced unit is returned to the supplier');
      if (d.status === 'sent') {
        if (c.rma !== 'pending') throw unprocessable('This unit has already been marked as sent');
        if (!d.reference) throw unprocessable('Enter the supplier return reference', { reference: 'Reference is required' });
      } else {
        if (c.rma !== 'sent') throw unprocessable('Mark the unit as sent to the supplier first');
        if (d.credit == null) throw unprocessable('Enter the credit received from the supplier (0 if none)', { credit: 'Credit amount is required' });
      }
      await repo.setRma(db, id, d.status, d.reference ?? null, d.credit ?? null);
      await logActivity(db, 'claim', id, `supplier_${d.status}`, userId, { reference: d.reference, credit: d.credit });
    });
    return this.get(id);
  },

  /** Step 6. The customer confirms it works: the claim is closed. */
  async close(id: number, userId: number) {
    await tx(async (db) => {
      const c = await repo.lock(db, id);
      if (!c) throw notFound('Claim');
      if (c.status !== 'fulfilled') throw unprocessable('Only a repaired or replaced claim can be closed after the customer confirms');
      await repo.close(db, id);
      await logActivity(db, 'claim', id, 'closed', userId);
    });
    return this.get(id);
  },

  async withdraw(id: number, reason: string, userId: number) {
    await tx(async (db) => {
      const c = await repo.lock(db, id);
      if (!c) throw notFound('Claim');
      if (!['filed', 'inspecting', 'inspected'].includes(c.status)) throw unprocessable(`This claim is ${c.status} and can no longer be withdrawn`);
      await repo.withdraw(db, id);
      await logActivity(db, 'claim', id, 'withdrawn', userId, { reason });
    });
    return this.get(id);
  },

  isLive: (status: string) => LIVE.includes(status),
};
