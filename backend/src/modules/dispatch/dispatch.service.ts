import { notify } from '../../realtime/socket';
import { notFound, unprocessable } from '../../lib/errors';
import { type Db, logActivity, prisma, q, tx } from '../../lib/prisma';
import { dispatchRepository as repo } from './dispatch.repository';

const OPEN = ['pending', 'packing'];

export const dispatchService = {
  list: repo.list,

  /** Pick list: what the order needs vs. which serials have been scanned. */
  async get(id: number, db: Db = prisma) {
    const header = await repo.header(db, id);
    if (!header) throw notFound('Dispatch');
    const lines = await repo.lines(db, id, header.order_id);
    const open = OPEN.includes(header.status);
    const items = await Promise.all(lines.map(async (l) => ({
      ...l,
      // oldest in-stock serials for this product: the warehouse can tap one instead of typing it
      suggested: open && l.tracked_serial && l.scanned.length < l.required
        ? (await q<{ serial_no: string }>(db, "SELECT serial_no FROM inventory_units WHERE product_id = $1 AND status = 'in_stock' ORDER BY id LIMIT $2", [l.product_id, l.required - l.scanned.length])).map((r) => r.serial_no)
        : [],
      scannedCount: l.scanned.length,
      complete: l.tracked_serial ? l.scanned.length >= l.required : l.on_hand >= l.required,
    })));
    const value = items.reduce((s, l) => s + l.unit_price * (l.tracked_serial ? l.scannedCount : l.required), 0);
    return { ...header, items, ready: items.every((l) => l.complete), value };
  },

  /** Scan a serial onto the truck. Ties that exact unit to this customer. */
  async scan(id: number, serial: string, userId: number) {
    await tx(async (db) => {
      const d = await repo.lockWithCustomer(db, id);
      if (!d) throw notFound('Dispatch');
      if (!OPEN.includes(d.status)) throw unprocessable('This dispatch has already left the warehouse');
      const unit = await repo.lockUnit(db, serial);
      if (!unit) throw notFound(`Serial ${serial}`);
      if (unit.status !== 'in_stock') throw unprocessable(`${serial} is not in stock (status: ${unit.status})`, { serial: 'Unit is not available' });
      const required = await repo.orderLineQty(db, d.order_id, unit.product_id);
      if (!required) throw unprocessable('This item does not belong to the order. Wrong product?', { serial: 'Not on this order' });
      if ((await repo.scannedCount(db, id, unit.product_id)) >= required)
        throw unprocessable('Already scanned the required quantity of this product', { serial: 'Quantity already complete' });

      await repo.attachUnit(db, unit.id, id, d.order_id, d.customer_id);
      await repo.movement(db, unit.product_id, -1, 'dispatch', id, userId);
      await repo.setStatus(db, id, 'packing');
    });
    return this.get(id);
  },

  /** Demo helper for sites without a barcode scanner: scan the oldest in-stock serial for every missing unit. */
  async autofill(id: number, userId: number) {
    const info: Record<string, any> = await this.get(id);
    for (const l of info.items) for (const serial of l.suggested) await this.scan(id, serial, userId);
    return this.get(id);
  },

  async unscan(id: number, serial: string, userId: number) {
    await tx(async (db) => {
      const status = await repo.statusOf(db, id);
      if (!status) throw notFound('Dispatch');
      if (!OPEN.includes(status)) throw unprocessable('Cannot change a dispatch that has already left');
      const unit = await repo.detachUnit(db, serial.toUpperCase(), id);
      if (!unit) throw notFound('Scanned serial');
      await repo.movement(db, unit.product_id, 1, 'dispatch_reversal', id, userId);
    });
    return this.get(id);
  },

  /** Truck leaves: every serial-tracked item must be scanned; bulk items are deducted from stock. */
  async dispatch(id: number, vehicleNo: string, userId: number) {
    await tx(async (db) => {
      const d = await repo.lock(db, id);
      if (!d) throw notFound('Dispatch');
      if (!OPEN.includes(d.status)) throw unprocessable('This dispatch has already left the warehouse');
      const info = await this.get(id, db);
      const missing = info.items.filter((l) => l.tracked_serial && l.scannedCount < l.required);
      if (missing.length)
        throw unprocessable(`Scan every serial number before dispatch. Missing: ${missing.map((m) => `${m.name} (${m.scannedCount}/${m.required})`).join(', ')}`);
      // A DB trigger raises a clear error if the warehouse does not hold enough
      for (const l of info.items.filter((x) => !x.tracked_serial)) await repo.movement(db, l.product_id, -l.required, 'dispatch', id, userId);
      await repo.markDispatched(db, id, vehicleNo);
      await repo.setOrderStatus(db, d.order_id, 'dispatched');
      await logActivity(db, 'order', d.order_id, 'dispatched', userId, { vehicle: vehicleNo });
    });
    return this.get(id);
  },

  /** Delivery confirmed -> DB trigger starts the warranty clock on every serial of this dispatch. */
  async deliver(id: number, userId: number) {
    await tx(async (db) => {
      const d = await repo.lock(db, id);
      if (!d) throw notFound('Dispatch');
      if (d.status !== 'dispatched') throw unprocessable('Only dispatched shipments can be marked delivered');
      await repo.markDelivered(db, id);
      await repo.setOrderStatus(db, d.order_id, 'delivered');
      await logActivity(db, 'order', d.order_id, 'delivered', userId);
    });
    const info: Record<string, any> = await this.get(id);
    notify(['sales'], 'dispatch:delivered', { title: `${info.order_no} delivered to ${info.customer_name}: assign a technician for the installation`, link: `/orders/${info.order_id}` });
    return info;
  },
};
