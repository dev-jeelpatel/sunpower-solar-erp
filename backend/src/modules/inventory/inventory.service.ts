import { notFound, unprocessable } from '../../lib/errors';
import { logActivity, tx } from '../../lib/prisma';
import { inventoryRepository as repo } from './inventory.repository';
import type { PoInput, ReceiveInput, SupplierInput } from './inventory.schema';

export const inventoryService = {
  stock: repo.stock,
  units: repo.units,

  async lookup(serial: string) {
    const unit = await repo.lookupSerial(serial.trim().toUpperCase());
    if (!unit) throw notFound('Serial number');
    return unit;
  },

  suppliers: repo.suppliers,
  createSupplier: (s: SupplierInput) => repo.insertSupplier(s),

  purchases: repo.purchases,

  async purchase(id: number) {
    const po = await repo.purchase(id);
    if (!po) throw notFound('Purchase order');
    return { ...po, items: await repo.purchaseItems(id) };
  },

  createPurchase: (d: PoInput, userId: number) => tx((db) => repo.insertPurchase(db, d, userId)),

  /**
   * Goods receipt. Serial-tracked lines must list exactly `quantity` unique serials,
   * which become individual inventory units. Everything also lands in the stock ledger.
   */
  receive(poId: number, d: ReceiveInput, userId: number) {
    return tx(async (db) => {
      const po = await repo.lockPurchase(db, poId);
      if (!po) throw notFound('Purchase order');
      if (po.status !== 'ordered') throw unprocessable(`This purchase order is already ${po.status}`);

      const items = await repo.itemsForReceipt(db, poId);
      const serialsByItem = new Map(d.lines.map((l) => [l.itemId, l.serials]));
      const all: string[] = [];
      const errors: Record<string, string> = {};
      for (const it of items) {
        if (!it.tracked_serial) continue;
        const s = serialsByItem.get(it.id) ?? [];
        if (s.length !== it.quantity) errors[`serials.${it.id}`] = `${it.sku}: enter exactly ${it.quantity} serial numbers (got ${s.length})`;
        all.push(...s);
      }
      if (Object.keys(errors).length) throw unprocessable('Serial numbers are incomplete', errors);
      if (new Set(all).size !== all.length) throw unprocessable('Duplicate serial numbers in this delivery');
      if (all.length) {
        const dup = await repo.existingSerials(db, all);
        if (dup.length) throw unprocessable(`Serial already exists: ${dup.map((r) => r.serial_no).join(', ')}`);
      }

      for (const it of items) {
        if (it.tracked_serial) for (const sn of serialsByItem.get(it.id) ?? []) await repo.insertUnit(db, it.product_id, sn, poId);
        await repo.insertMovement(db, it.product_id, it.quantity, poId, userId);
      }
      await repo.markReceived(db, poId);
      await logActivity(db, 'purchase_order', poId, 'received', userId);
      return { ok: true };
    });
  },
};
