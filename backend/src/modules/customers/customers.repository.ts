import { prisma, q, q1 } from '../../lib/prisma';

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
    q(prisma, 'SELECT id, order_no, status, total, created_at FROM orders WHERE customer_id = $1 ORDER BY id DESC', [id]),

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
};
