import { type Db, exec, prisma, q, q1 } from '../../lib/prisma';
import type { PoInput, SupplierInput } from './inventory.schema';

const WARRANTY_SQL = `CASE WHEN u.warranty_end IS NULL THEN 'not_started'
                           WHEN u.warranty_end >= current_date THEN 'in_warranty' ELSE 'expired' END`;

export type PoItemRow = { id: number; product_id: number; quantity: number; tracked_serial: boolean; sku: string };

export const inventoryRepository = {
  /** On hand vs committed to confirmed-but-undispatched orders. */
  stock: () =>
    q(
      prisma,
      `SELECT s.*, COALESCE(c.committed,0)::int AS committed, (s.on_hand - COALESCE(c.committed,0))::int AS available,
              (s.on_hand <= s.reorder_level) AS low
         FROM v_stock s
         LEFT JOIN (SELECT oi.product_id, SUM(oi.quantity) AS committed
                      FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN dispatches d ON d.order_id = o.id
                     WHERE d.status IN ('pending','packing') AND o.status = 'confirmed' GROUP BY oi.product_id) c ON c.product_id = s.product_id
        WHERE s.active ORDER BY s.category, s.name`,
    ),

  async units(f: { q: string | null; status: string | null; productId: number | null; limit: number; offset: number }) {
    const params = [f.q ? `%${f.q.toUpperCase()}%` : null, f.status, f.productId];
    const where = `($1::text IS NULL OR u.serial_no LIKE $1) AND ($2::text IS NULL OR u.status::text = $2) AND ($3::int IS NULL OR u.product_id = $3)`;
    const [items, total] = await Promise.all([
      q(
        prisma,
        `SELECT u.*, p.name AS product_name, p.sku, c.name AS customer_name, ${WARRANTY_SQL} AS warranty_state
           FROM inventory_units u JOIN products p ON p.id = u.product_id LEFT JOIN customers c ON c.id = u.customer_id
          WHERE ${where} ORDER BY u.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`,
        params,
      ),
      q1<{ n: number }>(prisma, `SELECT count(*) AS n FROM inventory_units u WHERE ${where}`, params),
    ]);
    return { items, total: total?.n ?? 0 };
  },

  lookupSerial: (serial: string) =>
    q1(
      prisma,
      `SELECT u.*, p.name AS product_name, p.sku, p.warranty_months, c.name AS customer_name, c.phone AS customer_phone,
              c.address AS customer_address, o.order_no, d.delivered_at, d.vehicle_no, ${WARRANTY_SQL} AS warranty_state,
              GREATEST(u.warranty_end - current_date, 0) AS days_left,
              (SELECT json_agg(json_build_object('id', t.id, 'ticketNo', t.ticket_no, 'status', t.status, 'subject', t.subject, 'createdAt', t.created_at) ORDER BY t.id DESC)
                 FROM tickets t WHERE t.unit_id = u.id) AS tickets
         FROM inventory_units u JOIN products p ON p.id = u.product_id
         LEFT JOIN customers c ON c.id = u.customer_id LEFT JOIN orders o ON o.id = u.order_id LEFT JOIN dispatches d ON d.id = u.dispatch_id
        WHERE u.serial_no = $1`,
      [serial],
    ),

  suppliers: () => q(prisma, 'SELECT * FROM suppliers ORDER BY name'),
  insertSupplier: (s: SupplierInput) =>
    q1(prisma, 'INSERT INTO suppliers (name, phone, email) VALUES ($1,$2,$3) RETURNING *', [s.name, s.phone ?? null, s.email ?? null]),

  purchases: () =>
    q(
      prisma,
      `SELECT po.*, s.name AS supplier_name, SUM(i.quantity * i.unit_cost) AS total, SUM(i.quantity)::int AS units
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id JOIN purchase_order_items i ON i.po_id = po.id
        GROUP BY po.id, s.name ORDER BY po.id DESC LIMIT 100`,
    ),

  purchase: (id: number) =>
    q1(prisma, 'SELECT po.*, s.name AS supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = $1', [id]),

  purchaseItems: (poId: number) =>
    q(
      prisma,
      `SELECT i.*, p.name, p.sku, p.tracked_serial FROM purchase_order_items i JOIN products p ON p.id = i.product_id
        WHERE po_id = $1 ORDER BY i.id`,
      [poId],
    ),

  async insertPurchase(db: Db, d: PoInput, userId: number) {
    const po = await q1<{ id: number }>(db, 'INSERT INTO purchase_orders (supplier_id, created_by) VALUES ($1,$2) RETURNING *', [d.supplierId, userId]);
    for (const i of d.items) {
      await exec(db, 'INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_cost) VALUES ($1,$2,$3,$4)', [po!.id, i.productId, i.quantity, i.unitCost]);
    }
    return po!;
  },

  lockPurchase: (db: Db, id: number) => q1<{ id: number; status: string }>(db, 'SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [id]),

  itemsForReceipt: (db: Db, poId: number) =>
    q<PoItemRow>(
      db,
      `SELECT i.*, p.tracked_serial, p.sku FROM purchase_order_items i JOIN products p ON p.id = i.product_id WHERE po_id = $1`,
      [poId],
    ),

  existingSerials: (db: Db, serials: string[]) =>
    q<{ serial_no: string }>(db, 'SELECT serial_no FROM inventory_units WHERE serial_no = ANY($1::text[])', [serials]),

  insertUnit: (db: Db, productId: number, serial: string, poId: number) =>
    exec(db, 'INSERT INTO inventory_units (product_id, serial_no, po_id) VALUES ($1,$2,$3)', [productId, serial, poId]),

  insertMovement: (db: Db, productId: number, qty: number, poId: number, userId: number) =>
    exec(
      db,
      `INSERT INTO stock_movements (product_id, qty, reason, ref_type, ref_id, created_by)
       VALUES ($1,$2,'purchase'::movement_reason,'po',$3,$4)`,
      [productId, qty, poId, userId],
    ),

  markReceived: (db: Db, poId: number) => exec(db, `UPDATE purchase_orders SET status = 'received', received_at = now() WHERE id = $1`, [poId]),

  updateSupplier: (id: number, s: SupplierInput) =>
    q1(prisma, 'UPDATE suppliers SET name=$2, phone=$3, email=$4 WHERE id=$1 RETURNING *', [id, s.name, s.phone ?? null, s.email ?? null]),
  supplierPoCount: async (id: number) => (await q1<{ n: number }>(prisma, 'SELECT count(*) AS n FROM purchase_orders WHERE supplier_id = $1', [id]))?.n ?? 0,
  deleteSupplier: (id: number) => exec(prisma, 'DELETE FROM suppliers WHERE id = $1', [id]),

  markCancelled: (db: Db, poId: number) => exec(db, `UPDATE purchase_orders SET status = 'cancelled' WHERE id = $1`, [poId]),

  productForUnits: (db: Db, id: number) => q1<{ id: number; sku: string; tracked_serial: boolean; active: boolean }>(db, 'SELECT id, sku, tracked_serial, active FROM products WHERE id = $1', [id]),
  insertLooseUnit: (db: Db, productId: number, serial: string) => exec(db, 'INSERT INTO inventory_units (product_id, serial_no) VALUES ($1,$2)', [productId, serial]),
  adjust: (db: Db, productId: number, qty: number, unitId: number | null, userId: number) =>
    exec(db, `INSERT INTO stock_movements (product_id, qty, reason, ref_type, ref_id, created_by) VALUES ($1,$2,'adjustment'::movement_reason,'unit',$3,$4)`, [productId, qty, unitId, userId]),
  lockUnit: (db: Db, id: number) => q1<{ id: number; product_id: number; serial_no: string; status: string }>(db, 'SELECT * FROM inventory_units WHERE id = $1 FOR UPDATE', [id]),
  renameUnit: (db: Db, id: number, serial: string) => exec(db, 'UPDATE inventory_units SET serial_no = $2 WHERE id = $1', [id, serial]),
  deleteUnit: (db: Db, id: number) => exec(db, 'DELETE FROM inventory_units WHERE id = $1', [id]),

  onHand: async (db: Db, productId: number) => (await q1<{ n: number }>(db, 'SELECT COALESCE(SUM(qty),0)::int AS n FROM stock_movements WHERE product_id = $1', [productId]))?.n ?? 0,
  manualAdjust: (db: Db, productId: number, qty: number, userId: number) =>
    exec(db, `INSERT INTO stock_movements (product_id, qty, reason, ref_type, created_by) VALUES ($1,$2,'adjustment'::movement_reason,'manual',$3)`, [productId, qty, userId]),
};
