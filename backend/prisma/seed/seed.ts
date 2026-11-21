// @ts-nocheck
// Demo data: staff, catalogue, packages (bill of materials), stock with serial numbers,
// a live sales pipeline, and historical installations (in and out of warranty).
// Usage: npm run db:seed   (empty database only)
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { env } from '../../src/config/env';
import { prisma, tx as prismaTx } from '../../src/lib/prisma';
import { ordersService } from '../../src/modules/orders/orders.service';

const pool = new Pool({ connectionString: env.databaseUrl });
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
const PASSWORD = 'Sunpower@123';

const STAFF = [
  ['Aarav Admin', 'admin@sunpower.test', 'admin', 0],
  ['Sneha Sales', 'sales@sunpower.test', 'sales', 0],
  ['Rohan Sales', 'sales2@sunpower.test', 'sales', 0],
  ['Tejas Technician', 'tech1@sunpower.test', 'technician', 250],
  ['Imran Technician', 'tech2@sunpower.test', 'technician', 220],
  ['Kiran Technician', 'tech3@sunpower.test', 'technician', 200],
  ['Wendy Warehouse', 'warehouse@sunpower.test', 'warehouse', 0],
  ['Sana Support', 'support@sunpower.test', 'support', 0],
  ['Divya Director', 'director@sunpower.test', 'director', 0],
];

// sku, name, category, serial?, warrantyMonths, cost, sell, reorder
const PRODUCTS = [
  ['PNL-540', 'Mono PERC Solar Panel 540W', 'panel', true, 240, 8200, 9800, 12],
  ['INV-1K', 'Solar Inverter 1 kW', 'inverter', true, 24, 9000, 11500, 2],
  ['INV-2K', 'Solar Inverter 2 kW', 'inverter', true, 24, 14000, 17000, 2],
  ['INV-3K', 'Solar Inverter 3 kW', 'inverter', true, 24, 19000, 23000, 2],
  ['INV-4K', 'Solar Inverter 4 kW', 'inverter', true, 24, 24000, 29000, 2],
  ['INV-5K', 'Solar Inverter 5 kW', 'inverter', true, 24, 30000, 36000, 2],
  ['BAT-150', 'Tubular Battery 12V 150Ah', 'battery', true, 24, 13500, 16500, 4],
  ['MPPT-40A', 'MPPT Charge Controller 40A', 'charge_controller', true, 24, 3500, 4600, 3],
  ['MPPT-60A', 'MPPT Charge Controller 60A', 'charge_controller', true, 24, 5200, 6800, 3],
  ['STAND-AL', 'Aluminium Mounting Stand (per panel)', 'stand', false, 0, 1100, 1500, 20],
  ['DCDB', 'DC Distribution Box', 'wiring_box', false, 0, 1800, 2400, 4],
  ['ACDB', 'AC Distribution Box', 'wiring_box', false, 0, 1500, 2000, 4],
  ['MCB-SW', 'MCB Safety Switch', 'switch', false, 0, 400, 600, 10],
  ['CBL-DC', 'DC Solar Cable 4 sq mm (per metre)', 'cable', false, 0, 60, 85, 100],
  ['CBL-AC', 'AC Cable (per metre)', 'cable', false, 0, 90, 125, 100],
  ['MC4', 'MC4 Connector Pair', 'connector', false, 0, 80, 120, 20],
  ['EARTH-KIT', 'Safety Earthing Kit', 'earthing', false, 0, 2200, 3000, 4],
  ['SVC-INSTALL', 'Installation & Testing (per kW)', 'service', false, 0, 0, 4000, 0],
];

const PANELS = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 };
function bom(type, kw) {
  const n = PANELS[kw];
  const items = [['PNL-540', n], [`INV-${kw}K`, 1], [kw <= 2 ? 'MPPT-40A' : 'MPPT-60A', 1], ['STAND-AL', n], ['DCDB', 1], ['ACDB', 1],
    ['MCB-SW', 2], ['CBL-DC', 15 + 5 * kw], ['CBL-AC', 10], ['MC4', n], ['EARTH-KIT', 1], ['SVC-INSTALL', kw]];
  if (type === 'off_grid') items.push(['BAT-150', kw + (kw >= 3 ? 1 : 0)]);
  return items;
}

async function main() {
  const { rows: existing } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (existing[0].n > 0) throw new Error('Database already has data. Run "npm run db:reset" for a clean demo database.');
  const hash = await bcrypt.hash(PASSWORD, 10);

  await tx(async (db) => {
    // ---- staff
    const U = {};
    for (const [name, email, role, rate] of STAFF) {
      const { rows } = await db.query('INSERT INTO users (name,email,password_hash,role,hourly_rate) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, email, hash, role, rate]);
      U[email.split('@')[0]] = rows[0].id;
    }
    // ---- products
    const P = {};
    for (const [sku, name, cat, tracked, war, cost, sell, reorder] of PRODUCTS) {
      const { rows } = await db.query(
        'INSERT INTO products (sku,name,category,tracked_serial,warranty_months,cost_price,sell_price,reorder_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [sku, name, cat, tracked, war, cost, sell, reorder]);
      P[sku] = rows[0].id;
    }
    // ---- packages
    const PK = {};
    const mkPkg = async (name, kind, kw, desc, items) => {
      const { rows } = await db.query('INSERT INTO packages (name,kind,capacity_kw,description) VALUES ($1,$2,$3,$4) RETURNING id', [name, kind, kw, desc]);
      for (const [sku, q] of items) await db.query('INSERT INTO package_items (package_id,product_id,quantity) VALUES ($1,$2,$3)', [rows[0].id, P[sku], q]);
      return rows[0].id;
    };
    await mkPkg('Solar Panel Set (Hardware)', 'hardware', null, 'Solar panels, connectors and wires', [['PNL-540', 4], ['MC4', 4], ['CBL-DC', 20]]);
    for (const kw of [1, 2, 3, 4, 5]) {
      PK[`on_grid_${kw}`] = await mkPkg(`On-Grid System ${kw} kW`, 'on_grid', kw, 'Inverter, wiring boxes, charge controller, panels, earthing and stands', bom('on_grid', kw));
      PK[`off_grid_${kw}`] = await mkPkg(`Off-Grid System ${kw} kW`, 'off_grid', kw, 'Everything in On-Grid plus battery bank', bom('off_grid', kw));
    }
    await mkPkg('Installation (Service)', 'service', null, 'Fitting and testing by our crew', [['SVC-INSTALL', 1]]);

    // ---- supplier + goods receipt with serial numbers
    const { rows: sup } = await db.query(`INSERT INTO suppliers (name, phone) VALUES ('Sunrise Distributors Pvt Ltd','9825012345'), ('GreenVolt Components','9898098980') RETURNING id`);
    const { rows: po } = await db.query(`INSERT INTO purchase_orders (supplier_id, status, received_at, created_by) VALUES ($1,'received', now() - interval '10 days', $2) RETURNING id`, [sup[0].id, U.warehouse]);
    const stock = { 'PNL-540': 80, 'INV-1K': 3, 'INV-2K': 4, 'INV-3K': 6, 'INV-4K': 3, 'INV-5K': 3, 'BAT-150': 16, 'MPPT-40A': 6, 'MPPT-60A': 8,
      'STAND-AL': 120, DCDB: 20, ACDB: 20, 'MCB-SW': 60, 'CBL-DC': 1500, 'CBL-AC': 800, MC4: 120, 'EARTH-KIT': 20 };
    let sn = 4000;
    for (const [sku, qty] of Object.entries(stock)) {
      const prod = PRODUCTS.find((p) => p[0] === sku);
      await db.query('INSERT INTO purchase_order_items (po_id,product_id,quantity,unit_cost) VALUES ($1,$2,$3,$4)', [po[0].id, P[sku], qty, prod[5]]);
      if (prod[3]) for (let i = 0; i < qty; i++) {
        await db.query('INSERT INTO inventory_units (product_id, serial_no, po_id) VALUES ($1,$2,$3)', [P[sku], `SP-${sku.replace(/-/g, '')}-${String(++sn).padStart(6, '0')}`, po[0].id]);
      }
      await db.query(`INSERT INTO stock_movements (product_id, qty, reason, ref_type, ref_id, created_by) VALUES ($1,$2,'purchase','po',$3,$4)`, [P[sku], qty, po[0].id, U.warehouse]);
    }

    // ---- helpers for pipeline records
    const mkEnquiry = async (name, phone, kw, type, status, extra = {}) => {
      const { rows } = await db.query(
        `INSERT INTO enquiries (customer_name, phone, email, address, city, requested_kw, system_type, subsidy_required, source, status, assigned_to,
                                shadow_free_sqft, monthly_bill, grid_suitable, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now() - ($15 || ' days')::interval) RETURNING id`,
        [name, phone, extra.email || null, extra.address || '12 Shanti Nagar, Near Water Tank', extra.city || 'Ahmedabad', kw, type, extra.subsidy ?? false,
         extra.source || 'web', status, extra.assignee || U.sales, extra.sqft ?? null, extra.bill ?? null, extra.grid ?? null, String(extra.daysAgo ?? 1)]);
      return rows[0].id;
    };
    const mkSurvey = async (enquiryId, techKey, status, daysAhead = 1) => {
      await db.query(
        `INSERT INTO surveys (enquiry_id, technician_id, scheduled_date, status, roof_direction, roof_tilt_deg, cable_distance_m, usable_area_sqft, completed_at, reviewed_by)
         VALUES ($1,$2, current_date + $3::int, $4, $5, $6, $7, $8, $9, $10)`,
        [enquiryId, U[techKey], daysAhead, status, status === 'scheduled' ? null : 'S', status === 'scheduled' ? null : 18, status === 'scheduled' ? null : 22,
         status === 'scheduled' ? null : 420, status === 'scheduled' ? null : new Date(), ['approved', 'rejected'].includes(status) ? U.sales : null]);
    };
    const mkQuote = async (enquiryId, pkgId, status, createdDaysAgo = 1) => {
      const { rows: items } = await db.query(`SELECT p.id, p.name, p.sell_price, p.cost_price, pi.quantity FROM package_items pi JOIN products p ON p.id = pi.product_id WHERE package_id = $1`, [pkgId]);
      const subtotal = items.reduce((s, i) => s + i.sell_price * i.quantity, 0);
      const tax = Math.round(subtotal * 0.05 * 100) / 100;
      const { rows } = await db.query(
        `INSERT INTO quotes (enquiry_id, package_id, status, subtotal, tax_percent, tax_amount, total, valid_until, created_by, created_at)
         VALUES ($1,$2,$3,$4,5,$5,$6, current_date + 15, $7, now() - ($8 || ' days')::interval) RETURNING id`,
        [enquiryId, pkgId, status, subtotal, tax, subtotal + tax, U.sales, String(createdDaysAgo)]);
      for (const i of items) await db.query('INSERT INTO quote_items (quote_id,product_id,description,quantity,unit_price,unit_cost) VALUES ($1,$2,$3,$4,$5,$6)', [rows[0].id, i.id, i.name, i.quantity, i.sell_price, i.cost_price]);
      return rows[0].id;
    };

    // ---- live sales pipeline
    await mkEnquiry('Hetal Shah', '9879012345', 3, 'on_grid', 'new', { subsidy: true, email: 'hetal.shah@example.com', daysAgo: 0 });
    await mkEnquiry('Mahesh Desai', '9825566778', 2, 'on_grid', 'contacted', { daysAgo: 1 });
    await mkEnquiry('Pooja Mehta', '9898123456', 4, 'off_grid', 'qualified', { sqft: 520, bill: 7800, grid: true, daysAgo: 2 });
    const e4 = await mkEnquiry('Vijay Trivedi', '9727345678', 5, 'on_grid', 'survey_scheduled', { sqft: 700, bill: 15000, grid: true, daysAgo: 3, subsidy: true });
    await mkSurvey(e4, 'tech1', 'scheduled', 1);
    const e5 = await mkEnquiry('Anita Joshi', '9909234567', 3, 'on_grid', 'survey_approved', { sqft: 450, bill: 6200, grid: true, daysAgo: 5, subsidy: true });
    await mkSurvey(e5, 'tech2', 'approved', -2);
    const e6 = await mkEnquiry('Bhavesh Patel Engineering', '9374012345', 5, 'off_grid', 'quoted', { sqft: 900, bill: 24000, grid: true, daysAgo: 7, address: 'Plot 44, GIDC Vatva' });
    await mkSurvey(e6, 'tech3', 'approved', -4);
    await mkQuote(e6, PK.off_grid_5, 'sent', 2);

    // ---- an order waiting for the advance payment
    const e7 = await mkEnquiry('Kalpesh Rana', '9879654321', 2, 'on_grid', 'quoted', { sqft: 300, bill: 4200, grid: true, daysAgo: 6, subsidy: true, source: 'whatsapp' });
    await mkSurvey(e7, 'tech1', 'approved', -3);
    const q7 = await mkQuote(e7, PK.on_grid_2, 'sent', 3);
    // ---- an order that is paid & confirmed: warehouse must pack, crew is scheduled
    const e8 = await mkEnquiry('Nisha Kapadia', '9825099887', 3, 'off_grid', 'quoted', { sqft: 480, bill: 9100, grid: true, daysAgo: 8, source: 'call' });
    await mkSurvey(e8, 'tech2', 'approved', -5);
    const q8 = await mkQuote(e8, PK.off_grid_3, 'sent', 4);

    // ---- historical installations (for the warranty / support story)
    const history = async (name, phone, kw, type, monthsAgo, city, hours) => {
      const e = await mkEnquiry(name, phone, kw, type, 'won', { sqft: 400, bill: 5000, grid: true, daysAgo: monthsAgo * 30 + 20, city });
      await mkSurvey(e, 'tech1', 'approved', -monthsAgo * 30 - 15);
      const q = await mkQuote(e, PK[`${type}_${kw}`], 'accepted', monthsAgo * 30 + 12);
      const { rows: cu } = await db.query(`INSERT INTO customers (name, phone, address, city) VALUES ($1,$2,'Historic Customer Address, Satellite',$3) RETURNING id`, [name, phone, city]);
      await db.query('UPDATE enquiries SET customer_id = $2 WHERE id = $1', [e, cu[0].id]);
      const { rows: qt } = await db.query('SELECT * FROM quotes WHERE id = $1', [q]);
      const ageSql = `now() - interval '${monthsAgo} months'`;
      const { rows: o } = await db.query(`INSERT INTO orders (quote_id, customer_id, status, total, confirmed_at, completed_at, created_at) VALUES ($1,$2,'completed',$3, ${ageSql} - interval '10 days', ${ageSql} + interval '3 days', ${ageSql} - interval '12 days') RETURNING id`, [q, cu[0].id, qt[0].total]);
      await db.query('INSERT INTO order_items (order_id,product_id,quantity,unit_price,unit_cost) SELECT $1, product_id, quantity, unit_price, unit_cost FROM quote_items WHERE quote_id = $2', [o[0].id, q]);
      const { rows: inv } = await db.query(`INSERT INTO invoices (kind, order_id, customer_id, status, subtotal, tax_amount, total, issued_at) VALUES ('order',$1,$2,'paid',$3,$4,$5, (${ageSql} - interval '12 days')::date) RETURNING id`, [o[0].id, cu[0].id, qt[0].subtotal, qt[0].tax_amount, qt[0].total]);
      await db.query('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) SELECT $1, description, quantity, unit_price FROM quote_items WHERE quote_id = $2', [inv[0].id, q]);
      await db.query(`INSERT INTO payments (invoice_id, amount, method, received_by, paid_at) VALUES ($1,$2,'bank_transfer',$3, ${ageSql} - interval '10 days'), ($1,$4,'upi',$3, ${ageSql} + interval '3 days')`,
        [inv[0].id, Math.round(qt[0].total * 0.4), U.sales, qt[0].total - Math.round(qt[0].total * 0.4)]);
      const { rows: d } = await db.query(`INSERT INTO dispatches (order_id, status, vehicle_no, dispatched_at) VALUES ($1,'dispatched','GJ01AB1234', ${ageSql}) RETURNING id`, [o[0].id]);
      const { rows: items } = await db.query('SELECT oi.*, p.tracked_serial FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE order_id = $1', [o[0].id]);
      for (const it of items) {
        const { rows: pr } = await db.query('SELECT sku, category FROM products WHERE id = $1', [it.product_id]);
        if (pr[0].category === 'service') continue;
        if (it.tracked_serial) {
          for (let i = 0; i < it.quantity; i++) {
            await db.query(`INSERT INTO inventory_units (product_id, serial_no, status, dispatch_id, order_id, customer_id) VALUES ($1,$2,'dispatched',$3,$4,$5)`,
              [it.product_id, `HX-${pr[0].sku.replace(/-/g, '')}-${phone.slice(-4)}${i}`, d[0].id, o[0].id, cu[0].id]);
          }
        }
      }
      // delivery fires the DB trigger that starts every warranty clock
      await db.query(`UPDATE dispatches SET status = 'delivered', delivered_at = ${ageSql} + interval '1 day' WHERE id = $1`, [d[0].id]);
      const { rows: j } = await db.query(
        `INSERT INTO installation_jobs (order_id, status, scheduled_date, started_at, finished_at, confirmed_kw, signer_name, signature_data, signed_at)
         VALUES ($1,'completed', (${ageSql})::date, ${ageSql} + interval '3 days' - interval '${hours} hours', ${ageSql} + interval '3 days', $2, $3, 'data:image/png;base64,iVBORw0KGgo=', ${ageSql} + interval '3 days') RETURNING id`,
        [o[0].id, kw, name]);
      await db.query('INSERT INTO job_crew (job_id, user_id) VALUES ($1,$2), ($1,$3)', [j[0].id, U.tech1, U.tech2]);
      return o[0].id;
    };
    await history('Ramesh Parmar', '9824111222', 3, 'on_grid', 18, 'Surat', 9);      // inverter still in warranty
    await history('Dhruv Solanki', '9825333444', 2, 'off_grid', 30, 'Vadodara', 14); // inverter / battery expired, panels in warranty
    await history('Smita Bhatt', '9426555666', 1, 'on_grid', 2, 'Ahmedabad', 5);     // recent job

    // Tickets: one in warranty, one out
    const unit = async (phone, sku) => (await db.query(
      `SELECT u.id, u.customer_id FROM inventory_units u JOIN customers c ON c.id = u.customer_id JOIN products p ON p.id = u.product_id WHERE c.phone = $1 AND p.sku = $2 LIMIT 1`, [phone, sku])).rows[0];
    const inW = await unit('9824111222', 'INV-3K');
    await db.query(`INSERT INTO tickets (customer_id, unit_id, subject, description, fault_code, priority, warranty_status, created_by)
                    VALUES ($1,$2,'Inverter showing fault code E-04, zero power','Heavy rain last night, no generation since morning','E04','urgent','in_warranty',$3)`, [inW.customer_id, inW.id, U.support]);
    const outW = await unit('9825333444', 'BAT-150');
    await db.query(`INSERT INTO tickets (customer_id, unit_id, subject, description, priority, warranty_status, created_by)
                    VALUES ($1,$2,'Battery not holding charge','Backup lasts under 30 minutes','normal','out_of_warranty',$3)`, [outW.customer_id, outW.id, U.support]);

    // Create the two live orders through the real service logic
  });

  // Orders go through the same service code the API uses
  const { rows: q } = await pool.query(`SELECT id, enquiry_id FROM quotes WHERE status = 'sent' ORDER BY id`);
  const [salesRow] = (await pool.query(`SELECT id FROM users WHERE email = 'sales@sunpower.test'`)).rows;
  const byEnq = async (name) => (await pool.query(`SELECT q.id FROM quotes q JOIN enquiries e ON e.id = q.enquiry_id WHERE e.customer_name = $1`, [name])).rows[0].id;
  await ordersService.createFromQuote(await byEnq('Kalpesh Rana'), salesRow.id);
  const o8 = await ordersService.createFromQuote(await byEnq('Nisha Kapadia'), salesRow.id);
  await tx(async (db) => {
    const { rows: inv } = await db.query('SELECT id, total FROM invoices WHERE order_id = $1', [o8.id]);
    await db.query(`INSERT INTO payments (invoice_id, amount, method, reference, received_by) VALUES ($1,$2,'upi','UPI-DEMO-1001',$3)`, [inv[0].id, Math.round(inv[0].total * 0.4), salesRow.id]);
    await db.query(`UPDATE invoices SET status = 'partially_paid' WHERE id = $1`, [inv[0].id]);
  });
  await prismaTx(async (pdb) => {
    await ordersService.confirm(pdb, o8.id, salesRow.id);
  });
  void q;

  console.log('Seed complete.');
  console.log(`Login with any of: ${STAFF.map((s) => s[1]).join(', ')}\nPassword for all: ${PASSWORD}`);
}

main().then(() => Promise.all([pool.end(), prisma.$disconnect()])).catch((e) => { console.error(e); pool.end(); prisma.$disconnect(); process.exit(1); });
