import { type Db, exec, prisma, q, q1 } from '../../lib/prisma';
import type { PackageInput, ProductInput } from './catalog.schema';

const productParams = (p: ProductInput) => [p.sku, p.name, p.category, p.trackedSerial, p.warrantyMonths, p.costPrice, p.sellPrice, p.reorderLevel];

export const catalogRepository = {
  products: (category: string | null, search: string | null) =>
    q(
      prisma,
      `SELECT * FROM v_stock WHERE active AND ($1::text IS NULL OR category::text = $1) AND ($2::text IS NULL OR name ILIKE $2 OR sku ILIKE $2)
        ORDER BY category, name`,
      [category, search ? `%${search}%` : null],
    ),

  insertProduct: (p: ProductInput) =>
    q1(
      prisma,
      `INSERT INTO products (sku, name, category, tracked_serial, warranty_months, cost_price, sell_price, reorder_level)
       VALUES ($1,$2,$3::product_category,$4,$5,$6,$7,$8) RETURNING *`,
      productParams(p),
    ),

  updateProduct: (id: number, p: ProductInput) =>
    q1(
      prisma,
      `UPDATE products SET sku=$2, name=$3, category=$4::product_category, tracked_serial=$5, warranty_months=$6, cost_price=$7, sell_price=$8, reorder_level=$9
        WHERE id=$1 RETURNING *`,
      [id, ...productParams(p)],
    ),

  packages: (kind: string | null) =>
    q(
      prisma,
      `SELECT pk.*, COALESCE(json_agg(json_build_object('productId', p.id, 'sku', p.sku, 'name', p.name, 'quantity', pi.quantity,
                'unitPrice', p.sell_price) ORDER BY p.category, p.name) FILTER (WHERE p.id IS NOT NULL), '[]') AS items,
              COALESCE(SUM(pi.quantity * p.sell_price), 0) AS list_price
         FROM packages pk
         LEFT JOIN package_items pi ON pi.package_id = pk.id
         LEFT JOIN products p ON p.id = pi.product_id
        WHERE pk.active AND ($1::text IS NULL OR pk.kind::text = $1)
        GROUP BY pk.id ORDER BY pk.kind, pk.capacity_kw`,
      [kind],
    ),

  insertPackage: (db: Db, p: PackageInput) =>
    q1(db, 'INSERT INTO packages (name, kind, capacity_kw, description) VALUES ($1,$2::package_kind,$3,$4) RETURNING *', [
      p.name, p.kind, p.capacityKw ?? null, p.description ?? null,
    ]),

  upsertPackageItem: (db: Db, packageId: number, productId: number, quantity: number) =>
    exec(
      db,
      `INSERT INTO package_items (package_id, product_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (package_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
      [packageId, productId, quantity],
    ),

  deactivatePackage: (id: number) => exec(prisma, 'UPDATE packages SET active = FALSE WHERE id = $1', [id]),

  productExists: (id: number) => q1(prisma, 'SELECT id FROM products WHERE id = $1', [id]),

  productUse: (id: number) =>
    q1<{ in_packages: string | null; has_history: boolean }>(
      prisma,
      `SELECT (SELECT string_agg(pk.name, ', ') FROM package_items pi JOIN packages pk ON pk.id = pi.package_id WHERE pi.product_id = $1 AND pk.active) AS in_packages,
              (EXISTS (SELECT 1 FROM package_items WHERE product_id = $1) OR EXISTS (SELECT 1 FROM quote_items WHERE product_id = $1)
               OR EXISTS (SELECT 1 FROM order_items WHERE product_id = $1) OR EXISTS (SELECT 1 FROM purchase_order_items WHERE product_id = $1)
               OR EXISTS (SELECT 1 FROM stock_movements WHERE product_id = $1) OR EXISTS (SELECT 1 FROM inventory_units WHERE product_id = $1)
               OR EXISTS (SELECT 1 FROM ticket_lines WHERE product_id = $1)) AS has_history`,
      [id],
    ),

  deleteProduct: (id: number) => exec(prisma, 'DELETE FROM products WHERE id = $1', [id]),
  hideProduct: (id: number) => exec(prisma, 'UPDATE products SET active = FALSE WHERE id = $1', [id]),

  updatePackage: (db: Db, id: number, p: PackageInput) =>
    q1(db, 'UPDATE packages SET name=$2, kind=$3::package_kind, capacity_kw=$4, description=$5 WHERE id=$1 AND active RETURNING *', [
      id, p.name, p.kind, p.capacityKw ?? null, p.description ?? null,
    ]),
  clearPackageItems: (db: Db, id: number) => exec(db, 'DELETE FROM package_items WHERE package_id = $1', [id]),
};
