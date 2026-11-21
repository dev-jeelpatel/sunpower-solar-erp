import { prisma, q, q1 } from '../../lib/prisma';

export const publicRepository = {
  /** Customer-facing price list: active on-grid / off-grid packages only, never cost prices. */
  packages: () =>
    q(
      prisma,
      `SELECT pk.id, pk.name, pk.kind, pk.capacity_kw, pk.description,
              COALESCE(SUM(pi.quantity * p.sell_price), 0) AS list_price,
              COALESCE(SUM(pi.quantity) FILTER (WHERE p.category = 'panel'), 0)::int AS panels
         FROM packages pk
         LEFT JOIN package_items pi ON pi.package_id = pk.id
         LEFT JOIN products p ON p.id = pi.product_id
        WHERE pk.active AND pk.kind IN ('on_grid','off_grid') AND pk.capacity_kw IS NOT NULL
        GROUP BY pk.id ORDER BY pk.kind, pk.capacity_kw`,
    ),

  /** Warranty status for one serial number. Exposes product + dates only: no customer details. */
  warranty: (serial: string) =>
    q1(
      prisma,
      `SELECT p.name AS product_name, u.warranty_start, u.warranty_end,
              CASE WHEN u.warranty_end IS NULL THEN 'not_started'
                   WHEN u.warranty_end >= current_date THEN 'in_warranty' ELSE 'expired' END AS warranty_state,
              GREATEST(u.warranty_end - current_date, 0) AS days_left
         FROM inventory_units u JOIN products p ON p.id = u.product_id WHERE u.serial_no = $1`,
      [serial],
    ),
};
