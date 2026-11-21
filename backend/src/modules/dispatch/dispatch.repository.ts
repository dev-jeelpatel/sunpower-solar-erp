import { type Db, exec, prisma, q, q1, type Row } from '../../lib/prisma';

export type DispatchLine = Row & {
  product_id: number; name: string; tracked_serial: boolean; required: number; unit_price: number; scanned: string[]; on_hand: number;
};

export const dispatchRepository = {
  list: (status: string | null) =>
    q(
      prisma,
      `SELECT d.id, d.status, d.vehicle_no, d.dispatched_at, d.delivered_at, d.created_at, o.order_no, c.name AS customer_name, c.city,
              (SELECT COUNT(*) FROM inventory_units u WHERE u.dispatch_id = d.id)::int AS scanned
         FROM dispatches d JOIN orders o ON o.id = d.order_id JOIN customers c ON c.id = o.customer_id
        WHERE ($1::text IS NULL OR d.status::text = $1) ORDER BY (d.status IN ('pending','packing')) DESC, d.id DESC LIMIT 100`,
      [status],
    ),

  header: (db: Db, id: number) =>
    q1<Row & { order_id: number }>(
      db,
      `SELECT d.*, o.order_no, o.id AS order_id, c.name AS customer_name, c.address, c.city, c.phone
         FROM dispatches d JOIN orders o ON o.id = d.order_id JOIN customers c ON c.id = o.customer_id WHERE d.id = $1`,
      [id],
    ),
  lines: (db: Db, dispatchId: number, orderId: number) =>
    q<DispatchLine>(
      db,
      `SELECT oi.product_id, p.sku, p.name, p.category, p.tracked_serial, oi.quantity AS required, oi.unit_cost, oi.unit_price,
              COALESCE((SELECT json_agg(u.serial_no ORDER BY u.id) FROM inventory_units u WHERE u.dispatch_id = $1 AND u.product_id = oi.product_id), '[]') AS scanned,
              COALESCE((SELECT SUM(m.qty) FROM stock_movements m WHERE m.product_id = oi.product_id),0)::int AS on_hand
         FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $2 AND p.category <> 'service' ORDER BY p.category, p.name`,
      [dispatchId, orderId],
    ),

  lockWithCustomer: (db: Db, id: number) =>
    q1<{ id: number; status: string; order_id: number; customer_id: number }>(
      db,
      'SELECT d.*, o.customer_id FROM dispatches d JOIN orders o ON o.id = d.order_id WHERE d.id = $1 FOR UPDATE OF d',
      [id],
    ),
  lock: (db: Db, id: number) => q1<{ id: number; status: string; order_id: number }>(db, 'SELECT * FROM dispatches WHERE id = $1 FOR UPDATE', [id]),

  lockUnit: (db: Db, serial: string) =>
    q1<{ id: number; product_id: number; status: string }>(db, 'SELECT * FROM inventory_units WHERE serial_no = $1 FOR UPDATE', [serial]),
  orderLineQty: async (db: Db, orderId: number, productId: number) =>
    (await q1<{ quantity: number }>(db, 'SELECT quantity FROM order_items WHERE order_id = $1 AND product_id = $2', [orderId, productId]))?.quantity,
  scannedCount: async (db: Db, dispatchId: number, productId: number) =>
    (await q1<{ n: number }>(db, 'SELECT count(*)::int AS n FROM inventory_units WHERE dispatch_id = $1 AND product_id = $2', [dispatchId, productId]))?.n ?? 0,

  attachUnit: (db: Db, unitId: number, dispatchId: number, orderId: number, customerId: number) =>
    exec(db, `UPDATE inventory_units SET status = 'dispatched', dispatch_id = $2, order_id = $3, customer_id = $4 WHERE id = $1`, [
      unitId, dispatchId, orderId, customerId,
    ]),
  detachUnit: (db: Db, serial: string, dispatchId: number) =>
    q1<{ product_id: number }>(
      db,
      `UPDATE inventory_units SET status = 'in_stock', dispatch_id = NULL, order_id = NULL, customer_id = NULL
        WHERE serial_no = $1 AND dispatch_id = $2 RETURNING product_id`,
      [serial, dispatchId],
    ),
  movement: (db: Db, productId: number, qty: number, reason: 'dispatch' | 'dispatch_reversal', dispatchId: number, userId: number) =>
    exec(
      db,
      `INSERT INTO stock_movements (product_id, qty, reason, ref_type, ref_id, created_by) VALUES ($1,$2,$3::movement_reason,'dispatch',$4,$5)`,
      [productId, qty, reason, dispatchId, userId],
    ),

  setStatus: (db: Db, id: number, status: 'packing') => exec(db, 'UPDATE dispatches SET status = $2::dispatch_status WHERE id = $1', [id, status]),
  markDispatched: (db: Db, id: number, vehicleNo: string) =>
    exec(db, `UPDATE dispatches SET status = 'dispatched', vehicle_no = $2, dispatched_at = now() WHERE id = $1`, [id, vehicleNo]),
  markDelivered: (db: Db, id: number) => exec(db, `UPDATE dispatches SET status = 'delivered', delivered_at = now() WHERE id = $1`, [id]),
  setOrderStatus: (db: Db, orderId: number, status: 'dispatched' | 'delivered') =>
    exec(db, 'UPDATE orders SET status = $2::order_status WHERE id = $1', [orderId, status]),
  statusOf: async (db: Db, id: number) => (await q1<{ status: string }>(db, 'SELECT status FROM dispatches WHERE id = $1 FOR UPDATE', [id]))?.status,
};
