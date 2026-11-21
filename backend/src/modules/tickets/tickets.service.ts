import { notify, notifyUsers } from '../../realtime/socket';
import { env } from '../../config/env';
import { notFound, unprocessable } from '../../lib/errors';
import { logActivity, prisma, tx } from '../../lib/prisma';
import { round2, today } from '../../lib/utils';
import { ticketsRepository as repo } from './tickets.repository';
import type { CreateTicketInput, LineInput, ResolveInput } from './tickets.schema';

const OPEN = ['open', 'assigned'];

export const ticketsService = {
  list: repo.list,

  async get(id: number) {
    const ticket = await repo.findDetailed(id);
    if (!ticket) throw notFound('Ticket');
    const [lines, invoice] = await Promise.all([repo.linesOf(id), repo.invoiceOf(id)]);
    const billable = ticket.warranty_status === 'out_of_warranty';
    return {
      ...ticket,
      lines: lines.map((l) => ({ ...l, billed_price: billable ? l.unit_price : 0 })),
      invoice: invoice ?? null,
      billable,
      warrantyCost: round2(lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0)),
    };
  },

  /** Raise a ticket from the serial number: customer + warranty are resolved automatically. */
  async create(d: CreateTicketInput, userId: number) {
    const id = await tx(async (db) => {
      let unitId: number | null = null;
      let customerId = d.customerId ?? null;
      let warranty = 'unknown';
      if (d.serial) {
        const unit = await repo.unitBySerial(db, d.serial);
        if (!unit) throw unprocessable('No unit with that serial number was found', { serial: 'Unknown serial number' });
        if (!unit.customer_id) throw unprocessable('That unit has not been delivered to a customer yet', { serial: 'Unit not delivered' });
        unitId = unit.id;
        customerId = unit.customer_id;
        if (unit.warranty_end) warranty = String(unit.warranty_end) >= today() ? 'in_warranty' : 'out_of_warranty';
      }
      const row = await repo.insert(db, {
        customerId: customerId!, unitId, subject: d.subject, description: d.description ?? null,
        faultCode: d.faultCode ?? null, priority: d.priority, warranty, userId,
      });
      await logActivity(db, 'ticket', row!.id, 'created', userId, { warranty });
      return row!.id;
    });
    const t: Record<string, any> = await this.get(id);
    notify(['support'], 'ticket:new', { title: `New ticket ${t.ticket_no}: ${t.subject}`, link: `/tickets/${id}` });
    return t;
  },

  async assign(id: number, assigneeId: number) {
    if (!(await repo.isAssignable(assigneeId))) throw unprocessable('Choose an active technician or support agent', { userId: 'Invalid assignee' });
    if (!(await repo.assign(id, assigneeId))) throw unprocessable('Only open tickets can be (re)assigned');
    const t: Record<string, any> = await this.get(id);
    notifyUsers([assigneeId], 'ticket:assigned', { title: `Ticket ${t.ticket_no} was assigned to you: ${t.subject}`, link: `/tickets/${id}` });
    return t;
  },

  /** Add one or many lines in a single step. If any line is wrong, none are saved. */
  async addLines(id: number, lines: LineInput[]) {
    await tx(async (db) => {
      const t = await repo.lock(db, id);
      if (!t) throw notFound('Ticket');
      if (!OPEN.includes(t.status)) throw unprocessable('This ticket is already resolved');
      for (const [i, d] of lines.entries()) {
        let price = d.unitPrice;
        let cost = 0;
        let desc = d.description;
        if (d.productId) {
          const p = await repo.product(db, d.productId);
          if (!p) throw notFound(`Product on line ${i + 1}`);
          price = price ?? p.sell_price;
          cost = p.cost_price;
          desc = desc || p.name;
        }
        if (price == null) throw unprocessable(`Line ${i + 1}: enter a price`, { unitPrice: 'Price is required for labour' });
        await repo.insertLine(db, id, d, desc, price, cost);
      }
    });
    return this.get(id);
  },

  addLine(id: number, d: LineInput) {
    return this.addLines(id, [d]);
  },

  async removeLine(id: number, lineId: number) {
    if (!(await repo.deleteLine(lineId, id))) throw notFound('Line');
    return this.get(id);
  },

  /**
   * Resolve: in warranty -> free (cost absorbed, tracked as warranty cost);
   * out of warranty -> invoice for parts + labour generated automatically.
   * An optional replacement serial swaps the faulty unit and starts a new warranty.
   */
  async resolve(id: number, d: ResolveInput, userId: number) {
    await tx(async (db) => {
      const t = await repo.lock(db, id);
      if (!t) throw notFound('Ticket');
      if (!OPEN.includes(t.status)) throw unprocessable('This ticket is already resolved');
      const lines = await repo.linesOf(id, db);

      let replacementId: number | null = null;
      if (d.replacementSerial) {
        if (!t.unit_id) throw unprocessable('Replacement needs the faulty unit on the ticket', { replacementSerial: 'No faulty unit on this ticket' });
        const old = await repo.unitById(db, t.unit_id);
        const fresh = await repo.lockReplacement(db, d.replacementSerial);
        if (!fresh) throw unprocessable('Replacement serial not found', { replacementSerial: 'Unknown serial number' });
        if (fresh.status !== 'in_stock') throw unprocessable('Replacement unit is not in stock', { replacementSerial: 'Unit is not in stock' });
        if (fresh.product_id !== old!.product_id) throw unprocessable('Replacement must be the same product model', { replacementSerial: 'Different product model' });
        await repo.markFaulty(db, old!.id);
        await repo.installReplacement(db, fresh.id, t.customer_id, old!.order_id, fresh.warranty_months ?? 0);
        await repo.movement(db, fresh.product_id, -1, id, userId);
        replacementId = fresh.id;
      }

      let invoiceId: number | null = null;
      if (t.warranty_status !== 'in_warranty') {
        if (!lines.length)
          throw unprocessable('This unit is out of warranty: add the parts and labour to bill before resolving', { lines: 'Add at least one part or labour line' });
        const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
        const tax = round2((subtotal * env.gstPercent) / 100);
        const inv = await repo.insertServiceInvoice(db, id, t.customer_id, subtotal, tax, round2(subtotal + tax));
        invoiceId = inv!.id;
        await repo.copyLinesToInvoice(db, invoiceId, id);
      }

      // Parts consumed from stock (non-serial)
      for (const l of lines.filter((x) => x.product_id)) {
        const p = await repo.product(db, l.product_id!);
        if (p && !p.tracked_serial) await repo.movement(db, l.product_id!, -Math.ceil(l.quantity), id, userId);
      }
      await repo.markResolved(db, id, d.resolution, replacementId);
      await logActivity(db, 'ticket', id, 'resolved', userId, { invoiceId, free: t.warranty_status === 'in_warranty' });
    });
    return this.get(id);
  },

  /** Customer confirms everything works -> ticket closed. */
  async confirm(id: number, userId: number) {
    if (!(await repo.confirm(id))) throw unprocessable('Only resolved tickets can be closed after customer confirmation');
    await logActivity(prisma, 'ticket', id, 'customer_confirmed', userId);
    return this.get(id);
  },

  /** Customer says it is not fixed -> back to the queue. */
  async reopen(id: number) {
    if (!(await repo.reopenAssigned(id)) && !(await repo.reopenOpen(id))) throw unprocessable('Only resolved tickets can be reopened');
    return this.get(id);
  },
};
