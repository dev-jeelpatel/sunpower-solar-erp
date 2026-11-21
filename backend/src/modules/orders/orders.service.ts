import { env } from '../../config/env';
import { notFound, unprocessable } from '../../lib/errors';
import { type Db, logActivity, tx } from '../../lib/prisma';
import { today, workingDayFromNow } from '../../lib/utils';
import { ordersRepository as repo } from './orders.repository';
import type { ScheduleInput } from './orders.schema';

/** Central subsidy for rooftop solar (PM Surya Ghar): Rs 30k/kW up to 2 kW, Rs 78k cap at 3 kW+. */
const subsidyFor = (kw: number) => (kw >= 3 ? 78000 : kw >= 2 ? 60000 : 30000);

export const ordersService = {
  list: repo.list,

  async get(id: number) {
    const order = await repo.findDetailed(id);
    if (!order) throw notFound('Order');
    const [items, invoice, dispatch, job, subsidy] = await Promise.all([
      repo.itemsOf(id), repo.invoiceOf(id), repo.dispatchOf(id), repo.jobOf(id), repo.subsidyOf(id),
    ]);
    const payments = invoice ? await repo.paymentsOf(invoice.id) : [];
    return {
      ...order, items, invoice: invoice ?? null, payments, dispatch: dispatch ?? null,
      job: job ?? null, subsidy: subsidy ?? null,
      advanceRequired: Math.round(order.total * env.advancePercent) / 100,
    };
  },

  /** Quote accepted -> order, order items (cost snapshot), invoice and optional subsidy file. */
  createFromQuote(quoteId: number, userId: number) {
    return tx(async (db) => {
      const quote = await repo.lockQuoteWithEnquiry(db, quoteId);
      if (!quote) throw notFound('Quote');
      if (quote.status !== 'sent')
        throw unprocessable(`Only a quote that has been sent to the customer can be accepted (this one is ${quote.status})`);
      if (String(quote.valid_until) < today()) throw unprocessable('This quote has expired. Create a new quote.');

      const customer = await repo.upsertCustomer(db, quote);
      const customerId = customer!.id;
      await repo.acceptQuote(db, quoteId);
      await repo.winEnquiry(db, quote.enquiry_id, customerId);
      await repo.rejectOtherQuotes(db, quote.enquiry_id, quoteId); // other open quotes are no longer relevant

      const order = (await repo.insertOrder(db, quoteId, customerId, quote.total))!;
      await repo.copyQuoteItemsToOrder(db, order.id, quoteId);

      const invoice = await repo.insertInvoice(db, order.id, customerId, quote.subtotal - quote.discount, quote.tax_amount, quote.total);
      await repo.copyQuoteItemsToInvoice(db, invoice!.id, quoteId);
      if (quote.discount > 0) await repo.insertDiscountLine(db, invoice!.id, quote.discount);

      if (quote.subsidy_required && quote.kind === 'on_grid') await repo.insertSubsidy(db, order.id, subsidyFor(Number(quote.capacity_kw)));
      await logActivity(db, 'order', order.id, 'created', userId, { quoteId });
      return order;
    });
  },

  /**
   * Called inside a payment transaction once the advance is received.
   * Tells the warehouse what to pack (dispatch row) and puts the job on a
   * technician's schedule (least-loaded technician, 3 working days out).
   */
  async confirm(db: Db, orderId: number, userId: number) {
    await repo.markConfirmed(db, orderId);
    await repo.ensureDispatch(db, orderId);
    const job = await repo.ensureJob(db, orderId);
    if (job) {
      const tech = await repo.leastLoadedTechnician(db);
      if (tech) {
        await repo.scheduleJob(db, job.id, workingDayFromNow(3));
        await repo.addCrew(db, job.id, tech.id);
      }
    }
    await logActivity(db, 'order', orderId, 'confirmed', userId, { advancePercent: env.advancePercent });
  },

  async cancel(id: number, userId: number) {
    await tx(async (db) => {
      const cur = await repo.lockStatus(db, id);
      if (!cur) throw notFound('Order');
      if (!['pending_payment', 'confirmed'].includes(cur.status)) throw unprocessable('Orders that have shipped cannot be cancelled');
      if ((await repo.paidTotal(db, id)) > 0) throw unprocessable('Payments were already received: refund them before cancelling');
      if (await repo.hasScannedUnits(db, id)) throw unprocessable('Serial-numbered items were already scanned for this order: unscan them first');
      await repo.cancel(db, id);
      await logActivity(db, 'order', id, 'cancelled', userId);
    });
    return this.get(id);
  },

  /** Sales / admin can reassign or reschedule the installation crew. */
  async schedule(id: number, d: ScheduleInput, userId: number) {
    await tx(async (db) => {
      const job = await repo.lockJob(db, id);
      if (!job) throw unprocessable('The order is not confirmed yet: record the advance payment first');
      if (job.status === 'completed') throw unprocessable('This installation is already completed');
      const techs = await repo.activeTechnicians(db, d.technicianIds);
      if (techs.length !== new Set(d.technicianIds).size)
        throw unprocessable('Every crew member must be an active technician', { technicianIds: 'Invalid technician selected' });
      await repo.clearCrew(db, job.id);
      for (const t of techs) await repo.addCrew(db, job.id, t.id);
      await repo.scheduleJob(db, job.id, d.scheduledDate);
      await logActivity(db, 'order', id, 'job_scheduled', userId, d);
    });
    return this.get(id);
  },
};
