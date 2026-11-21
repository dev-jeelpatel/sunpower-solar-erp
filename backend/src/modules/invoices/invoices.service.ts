import { notify } from '../../realtime/socket';
import { env } from '../../config/env';
import { notFound, unprocessable } from '../../lib/errors';
import { logActivity, tx } from '../../lib/prisma';
import { round2 } from '../../lib/utils';
import { ordersService } from '../orders/orders.service';
import { invoicesRepository as repo } from './invoices.repository';
import type { PayInput } from './invoices.schema';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export const invoicesService = {
  list: repo.list,

  async get(id: number) {
    const invoice = await repo.findDetailed(id);
    if (!invoice) throw notFound('Invoice');
    const [items, payments] = await Promise.all([repo.itemsOf(id), repo.paymentsOf(id)]);
    return { ...invoice, items, payments };
  },

  /** Record a payment. The first payment that reaches the advance threshold confirms the order. */
  pay(id: number, d: PayInput, userId: number) {
    return tx(async (db) => {
      const inv = await repo.lockInvoice(db, id);
      if (!inv) throw notFound('Invoice');
      if (inv.status === 'void') throw unprocessable('This invoice is void');
      const alreadyPaid = await repo.paidOn(db, id);
      const balance = round2(inv.total - alreadyPaid);
      if (balance <= 0) throw unprocessable('This invoice is already fully paid');
      if (d.amount > balance)
        throw unprocessable(`Amount exceeds the balance due (${inr(balance)})`, { amount: `Maximum payable is ${inr(balance)}` });

      await repo.insertPayment(db, id, d, userId);
      const paid = round2(alreadyPaid + d.amount);
      const status = paid >= inv.total ? 'paid' : 'partially_paid';
      await repo.setStatus(db, id, status);

      let orderConfirmed = false;
      if (inv.order_id) {
        const order = await repo.lockOrder(db, inv.order_id);
        if (order && order.status === 'pending_payment' && paid >= (order.total * env.advancePercent) / 100) {
          await ordersService.confirm(db, inv.order_id, userId);
          orderConfirmed = true;
        }
      }
      await logActivity(db, 'invoice', id, 'payment', userId, { amount: d.amount, method: d.method });
      return { invoiceId: id, paid, balance: round2(inv.total - paid), status, orderConfirmed, orderId: inv.order_id as number | null, invoiceNo: String((inv as any).invoice_no ?? '') };
    }).then((r) => {
      notify(['sales'], 'payment:received', { title: `Payment of ${inr(d.amount)} received on ${r.invoiceNo}`, link: r.orderId ? `/orders/${r.orderId}` : `/invoices/${r.invoiceId}` });
      if (r.orderConfirmed && r.orderId) notify(['warehouse'], 'dispatch:ready', { title: 'An order was confirmed: it is ready to pack and dispatch', link: '/dispatch' });
      return r;
    });
  },
};
