import { conflict, notFound, unprocessable } from '../../lib/errors';
import { logActivity, tx } from '../../lib/prisma';
import { inventoryRepository as repo } from './inventory.repository';
import type { AddUnitsInput, PoInput, ReceiveInput, SupplierInput } from './inventory.schema';

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

  async updateSupplier(id: number, s: SupplierInput) {
    let row;
    try {
      row = await repo.updateSupplier(id, s);
    } catch (e) {
      if (e instanceof Error && /unique|duplicate/i.test(e.message)) throw conflict('A supplier with this name already exists', { name: 'Name already in use' });
      throw e;
    }
    if (!row) throw notFound('Supplier');
    return row;
  },

  async removeSupplier(id: number) {
    if ((await repo.supplierPoCount(id)) > 0) throw unprocessable('This supplier has purchase orders, so it cannot be deleted');
    if (!(await repo.deleteSupplier(id))) throw notFound('Supplier');
  },

  cancelPurchase: (poId: number, userId: number) =>
    tx(async (db) => {
      const po = await repo.lockPurchase(db, poId);
      if (!po) throw notFound('Purchase order');
      if (po.status !== 'ordered') throw unprocessable(`Only an open purchase order can be cancelled (this one is ${po.status})`);
      await repo.markCancelled(db, poId);
      await logActivity(db, 'purchase_order', poId, 'cancelled', userId);
      return { ok: true };
    }),

  /** Add loose units to stock by hand (found stock, opening balance). Each one is also written to the stock ledger. */
  addUnits: (d: AddUnitsInput, userId: number) =>
    tx(async (db) => {
      const p = await repo.productForUnits(db, d.productId);
      if (!p || !p.active) throw notFound('Product');
      if (!p.tracked_serial) throw unprocessable('This product is counted by quantity, not by serial number', { productId: 'Not a serial-numbered product' });
      if (new Set(d.serials).size !== d.serials.length) throw unprocessable('Duplicate serial numbers in the list', { serials: 'Remove the repeated serials' });
      const dup = await repo.existingSerials(db, d.serials);
      if (dup.length) throw unprocessable(`Serial already exists: ${dup.map((r) => r.serial_no).join(', ')}`, { serials: 'Already in the system' });
      for (const s of d.serials) await repo.insertLooseUnit(db, p.id, s);
      await repo.adjust(db, p.id, d.serials.length, null, userId);
      await logActivity(db, 'product', p.id, 'units_added', userId, { count: d.serials.length });
      return { added: d.serials.length };
    }),

  renameUnit: (id: number, serial: string, userId: number) =>
    tx(async (db) => {
      const u = await repo.lockUnit(db, id);
      if (!u) throw notFound('Unit');
      if (u.status !== 'in_stock') throw unprocessable('Only units still in stock can be renamed');
      if (u.serial_no !== serial && (await repo.existingSerials(db, [serial])).length) throw conflict('This serial already exists', { serial: 'Already in the system' });
      await repo.renameUnit(db, id, serial);
      await logActivity(db, 'unit', id, 'renamed', userId, { from: u.serial_no, to: serial });
      return { ok: true };
    }),

  removeUnit: (id: number, userId: number) =>
    tx(async (db) => {
      const u = await repo.lockUnit(db, id);
      if (!u) throw notFound('Unit');
      if (u.status !== 'in_stock') throw unprocessable('Only units still in stock can be deleted. This one has already left the warehouse');
      await repo.deleteUnit(db, id);
      await repo.adjust(db, u.product_id, -1, null, userId);
      await logActivity(db, 'unit', id, 'deleted', userId, { serial: u.serial_no });
      return { ok: true };
    }),
};
