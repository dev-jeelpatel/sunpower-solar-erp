import { exec, prisma, q, q1 } from '../../lib/prisma';
import type { CustomerInput } from './customers.schema';

export const customersRepository = {
  list: (search: string | null, limit: number, offset: number) =>
    q(
      prisma,
      `SELECT c.*, (SELECT count(*) FROM orders o WHERE o.customer_id = c.id)::int AS orders,
              (SELECT count(*) FROM tickets t WHERE t.customer_id = c.id AND t.status <> 'closed')::int AS open_tickets
         FROM customers c
        WHERE ($1::text IS NULL OR c.name ILIKE $1 OR c.phone ILIKE $1 OR c.city ILIKE $1)
        ORDER BY c.id DESC LIMIT ${limit} OFFSET ${offset}`,
      [search ? `%${search}%` : null],
    ),

  findById: (id: number) => q1(prisma, 'SELECT * FROM customers WHERE id = $1', [id]),

  ordersOf: (id: number) =>
    q(prisma, `SELECT o.id, o.order_no, o.status, o.total, o.created_at, qt.enquiry_id, pk.name AS package_name,
                      (SELECT i.id FROM invoices i WHERE i.order_id = o.id LIMIT 1) AS invoice_id
                 FROM orders o JOIN quotes qt ON qt.id = o.quote_id LEFT JOIN packages pk ON pk.id = qt.package_id
                WHERE o.customer_id = $1 ORDER BY o.id DESC`, [id]),

  enquiriesOf: (id: number) =>
    q(prisma, 'SELECT id, status, requested_kw, system_type, created_at FROM enquiries WHERE customer_id = $1 ORDER BY id DESC', [id]),

  unitsOf: (id: number) =>
    q(
      prisma,
      `SELECT u.serial_no, u.warranty_end, p.name,
              CASE WHEN u.warranty_end >= current_date THEN 'in_warranty' ELSE 'expired' END AS warranty_state
         FROM inventory_units u JOIN products p ON p.id = u.product_id
        WHERE u.customer_id = $1 ORDER BY p.category, u.serial_no`,
      [id],
    ),

  ticketsOf: (id: number) =>
    q(prisma, 'SELECT id, ticket_no, subject, status, created_at FROM tickets WHERE customer_id = $1 ORDER BY id DESC', [id]),

  searchUnits: (term: string) =>
    q(
      prisma,
      `SELECT u.serial_no, p.name AS product_name, c.name AS customer_name, u.warranty_end,
              CASE WHEN u.warranty_end IS NULL THEN 'not_started' WHEN u.warranty_end >= current_date THEN 'in_warranty' ELSE 'expired' END AS warranty_state
         FROM inventory_units u JOIN products p ON p.id = u.product_id LEFT JOIN customers c ON c.id = u.customer_id
        WHERE u.serial_no LIKE $1 ORDER BY u.id DESC LIMIT 10`,
      [`%${term.toUpperCase()}%`],
    ),

  searchCustomers: (term: string) =>
    q(prisma, 'SELECT id, name, phone, city FROM customers WHERE name ILIKE $1 OR phone LIKE $1 ORDER BY name LIMIT 10', [`%${term}%`]),

  insert: (c: CustomerInput) =>
    q1(prisma, 'INSERT INTO customers (name, phone, email, address, city) VALUES ($1,$2,$3,$4,$5) RETURNING *', [c.name, c.phone, c.email ?? null, c.address, c.city ?? null]),
  update: (id: number, c: CustomerInput) =>
    q1(prisma, 'UPDATE customers SET name=$2, phone=$3, email=$4, address=$5, city=$6 WHERE id=$1 RETURNING *', [id, c.name, c.phone, c.email ?? null, c.address, c.city ?? null]),
  links: (id: number) =>
    q1<{ orders: number; tickets: number; units: number; invoices: number; enquiries: number }>(
      prisma,
      `SELECT (SELECT count(*) FROM orders WHERE customer_id = $1)::int AS orders, (SELECT count(*) FROM tickets WHERE customer_id = $1)::int AS tickets,
              (SELECT count(*) FROM inventory_units WHERE customer_id = $1)::int AS units, (SELECT count(*) FROM invoices WHERE customer_id = $1)::int AS invoices,
              (SELECT count(*) FROM enquiries WHERE customer_id = $1)::int AS enquiries`,
      [id],
    ),
  remove: (id: number) => exec(prisma, 'DELETE FROM customers WHERE id = $1', [id]),
};
