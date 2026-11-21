import { env } from '../../config/env';
import { notFound, unprocessable } from '../../lib/errors';
import { logActivity, prisma, tx } from '../../lib/prisma';
import { round2 } from '../../lib/utils';
import { ordersService } from '../orders/orders.service';
import { quotesRepository as repo } from './quotes.repository';
import type { CreateQuoteInput } from './quotes.schema';

export const quotesService = {
  list: repo.list,

  async get(id: number) {
    const quote = await repo.findDetailed(id);
    if (!quote) throw notFound('Quote');
    const [items, order] = await Promise.all([repo.itemsOf(id), repo.orderOf(id)]);
    return { ...quote, items, order: order ?? null };
  },

  /**
   * Create a quote from a package template: the bill of materials is copied so no part is forgotten.
   * A DB trigger additionally refuses a quote unless the site survey has been approved.
   */
  async create(d: CreateQuoteInput, userId: number) {
    const quoteId = await tx(async (db) => {
      const enq = await repo.lockEnquiry(db, d.enquiryId);
      if (!enq) throw notFound('Enquiry');
      if (!['survey_approved', 'quoted'].includes(enq.status))
        throw unprocessable('A quote can only be created after the site survey is approved');
      const pkg = await repo.activePackage(db, d.packageId);
      if (!pkg) throw notFound('Package');
      if ((pkg.kind === 'on_grid' || pkg.kind === 'off_grid') && pkg.kind !== enq.system_type)
        throw unprocessable(
          `Customer asked for ${enq.system_type.replace('_', '-')} but this package is ${pkg.kind.replace('_', '-')}`,
          { packageId: 'Package type does not match the enquiry' },
        );
      const bom = await repo.bomOf(db, d.packageId);
      if (!bom.length) throw unprocessable('This package has no items');

      const subtotal = round2(bom.reduce((s, i) => s + i.sell_price * i.quantity, 0));
      if (d.discount > subtotal) throw unprocessable('Discount cannot exceed the subtotal', { discount: 'Discount is larger than the subtotal' });
      const tax = round2(((subtotal - d.discount) * env.gstPercent) / 100);
      const total = round2(subtotal - d.discount + tax);
      const validUntil = new Date(Date.now() + env.quoteValidDays * 864e5).toISOString().slice(0, 10);

      const quote = await repo.insert(db, {
        enquiryId: d.enquiryId, packageId: d.packageId, subtotal, discount: d.discount,
        taxPercent: env.gstPercent, tax, total, validUntil, userId,
      });
      for (const item of bom) await repo.insertItem(db, quote!.id, item);
      await repo.markEnquiryQuoted(db, d.enquiryId);
      await logActivity(db, 'enquiry', d.enquiryId, 'quote_created', userId, { quoteId: quote!.id, total });
      return quote!.id;
    });
    return this.get(quoteId);
  },

  async transition(id: number, from: string[], to: string, userId: number) {
    const row = await repo.transition(prisma, id, to, from);
    if (!row) {
      const cur = await repo.statusOf(prisma, id);
      if (!cur) throw notFound('Quote');
      throw unprocessable(`Quote is ${cur.status}; it cannot be moved to ${to}`);
    }
    await logActivity(prisma, 'enquiry', row.enquiry_id, `quote_${to}`, userId, { quoteId: row.id });
    return this.get(id);
  },

  send: (id: number, userId: number) => quotesService.transition(id, ['draft'], 'sent', userId),
  reject: (id: number, userId: number) => quotesService.transition(id, ['sent'], 'rejected', userId),

  /** Customer says yes: quote -> order + invoice (+ subsidy file when requested). */
  accept: (id: number, userId: number) => ordersService.createFromQuote(id, userId),

  /** Drafts and declined quotes can be thrown away. Sent or accepted ones are records and stay. */
  async remove(id: number, userId: number) {
    const cur = await repo.find(id);
    if (!cur) throw notFound('Quote');
    if (!['draft', 'rejected'].includes(cur.status)) throw unprocessable('Only a draft or declined quote can be deleted');
    await repo.remove(id);
    await logActivity(prisma, 'enquiry', cur.enquiry_id, 'quote_deleted', userId, { quoteNo: cur.quote_no });
    return { ok: true };
  },
};
