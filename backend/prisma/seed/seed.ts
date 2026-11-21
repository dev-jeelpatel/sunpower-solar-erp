// @ts-nocheck
// Demo data: six months of business (June to 21 November 2026).
//   npm run db:seed      loads it into an EMPTY database
//   npm run db:reseed    wipes ALL data first, then loads it (everything runs in one transaction: all or nothing)
//
// Serial numbers are short and sequential so they are easy to type when scanning by hand:
//   PNL-001..   panels          INV1-001.. INV2-001.. INV3-001.. INV4-001.. INV5-001..  inverters by size
//   BAT-001..   batteries       MC40-001.. MC60-001..  charge controllers
// Stock is dispatched oldest-first, so the lowest number still "in stock" is always the next one to scan.
// Customer mobile numbers run 9825010001, 9825010002, ... in the order the enquiries arrived.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { env } from '../../src/config/env';

const pool = new Pool({ connectionString: env.databaseUrl });
const RESET = process.argv.includes('--reset');
const PASSWORD = 'Sunpower@123';

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

// ---------------------------------------------------------------- dates
const TODAY = '2026-11-21';
const DAY = 864e5;
const at = (iso, h = 11, m = 0) => new Date(`${iso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);
const plus = (d, days, hour) => {
  const x = new Date(d.getTime() + days * DAY);
  if (hour == null) return x;
  const iso = x.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return at(iso, hour);
};
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const subsidyFor = (kw) => (kw >= 3 ? 78000 : kw >= 2 ? 60000 : 30000);

// ---------------------------------------------------------------- reference data
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

// sku, name, category, serial?, warrantyMonths, cost, sell, reorder, serial prefix
const PRODUCTS = [
  ['PNL-540', 'Mono PERC Solar Panel 540W', 'panel', true, 240, 8200, 9800, 12, 'PNL'],
  ['INV-1K', 'Solar Inverter 1 kW', 'inverter', true, 24, 9000, 11500, 2, 'INV1'],
  ['INV-2K', 'Solar Inverter 2 kW', 'inverter', true, 24, 14000, 17000, 2, 'INV2'],
  ['INV-3K', 'Solar Inverter 3 kW', 'inverter', true, 24, 19000, 23000, 2, 'INV3'],
  ['INV-4K', 'Solar Inverter 4 kW', 'inverter', true, 24, 24000, 29000, 2, 'INV4'],
  ['INV-5K', 'Solar Inverter 5 kW', 'inverter', true, 24, 30000, 36000, 2, 'INV5'],
  ['BAT-150', 'Tubular Battery 12V 150Ah', 'battery', true, 24, 13500, 16500, 4, 'BAT'],
  ['MPPT-40A', 'MPPT Charge Controller 40A', 'charge_controller', true, 24, 3500, 4600, 3, 'MC40'],
  ['MPPT-60A', 'MPPT Charge Controller 60A', 'charge_controller', true, 24, 5200, 6800, 3, 'MC60'],
  ['STAND-AL', 'Aluminium Mounting Stand (per panel)', 'stand', false, 0, 1100, 1500, 20, null],
  ['DCDB', 'DC Distribution Box', 'wiring_box', false, 0, 1800, 2400, 4, null],
  ['ACDB', 'AC Distribution Box', 'wiring_box', false, 0, 1500, 2000, 4, null],
  ['MCB-SW', 'MCB Safety Switch', 'switch', false, 0, 400, 600, 10, null],
  ['CBL-DC', 'DC Solar Cable 4 sq mm (per metre)', 'cable', false, 0, 60, 85, 100, null],
  ['CBL-AC', 'AC Cable (per metre)', 'cable', false, 0, 90, 125, 100, null],
  ['MC4', 'MC4 Connector Pair', 'connector', false, 0, 80, 120, 20, null],
  ['EARTH-KIT', 'Safety Earthing Kit', 'earthing', false, 0, 2200, 3000, 4, null],
  ['SVC-INSTALL', 'Installation & Testing (per kW)', 'service', false, 0, 0, 4000, 0, null],
];

const PANELS = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 };
function bom(type, kw) {
  const n = PANELS[kw];
  const items = [['PNL-540', n], [`INV-${kw}K`, 1], [kw <= 2 ? 'MPPT-40A' : 'MPPT-60A', 1], ['STAND-AL', n], ['DCDB', 1], ['ACDB', 1],
    ['MCB-SW', 2], ['CBL-DC', 15 + 5 * kw], ['CBL-AC', 10], ['MC4', n], ['EARTH-KIT', 1], ['SVC-INSTALL', kw]];
  if (type === 'off_grid') items.push(['BAT-150', kw + (kw >= 3 ? 1 : 0)]);
  return items;
}

// ---------------------------------------------------------------- the six-month story
const NAMES = [
  ['Ramesh Parmar', 'Surat'], ['Dhruv Solanki', 'Vadodara'], ['Smita Bhatt', 'Ahmedabad'], ['Kalpesh Rana', 'Rajkot'],
  ['Nisha Kapadia', 'Ahmedabad'], ['Vijay Trivedi', 'Gandhinagar'], ['Anita Joshi', 'Surat'], ['Mahesh Desai', 'Vadodara'],
  ['Pooja Mehta', 'Ahmedabad'], ['Hetal Shah', 'Rajkot'], ['Bhavesh Patel', 'Surat'], ['Jignesh Modi', 'Bharuch'],
  ['Komal Dave', 'Ahmedabad'], ['Chirag Thakkar', 'Vadodara'], ['Rina Amin', 'Gandhinagar'], ['Sagar Vyas', 'Surat'],
  ['Payal Chauhan', 'Ahmedabad'], ['Harsh Panchal', 'Rajkot'], ['Isha Bhatt', 'Vadodara'], ['Nilesh Gandhi', 'Surat'],
  ['Divya Soni', 'Ahmedabad'], ['Tarun Jani', 'Gandhinagar'], ['Foram Patel', 'Rajkot'], ['Yash Raval', 'Surat'],
  ['Kavya Nair', 'Ahmedabad'], ['Mitesh Joshi', 'Vadodara'], ['Reena Kothari', 'Surat'], ['Pranav Shukla', 'Ahmedabad'],
  ['Alpa Dalal', 'Gandhinagar'], ['Kunal Barot', 'Rajkot'], ['Seema Rao', 'Ahmedabad'], ['Dev Mistry', 'Surat'],
];
const SOCIETIES = ['Shanti Nagar', 'Sunrise Society', 'Green Park', 'Maple Residency', 'Lotus Heights', 'Orchid Villas'];
// [enquiry date, where the deal stands today]
const PLAN = [
  ['2026-06-03', 'done'], ['2026-06-12', 'done'], ['2026-06-22', 'done'],
  ['2026-07-05', 'done'], ['2026-07-14', 'done'], ['2026-07-26', 'done'],
  ['2026-08-03', 'done'], ['2026-08-10', 'done'], ['2026-08-18', 'done'], ['2026-08-27', 'done'],
  ['2026-09-02', 'done'], ['2026-09-09', 'done'], ['2026-09-15', 'lost'], ['2026-09-22', 'done'], ['2026-09-28', 'done'],
  ['2026-10-03', 'done'], ['2026-10-08', 'done'], ['2026-10-14', 'done'], ['2026-10-20', 'done'], ['2026-10-24', 'done'],
  ['2026-10-28', 'installing'], ['2026-10-30', 'lost'],
  ['2026-11-01', 'ready'], ['2026-11-03', 'dispatched'], ['2026-11-05', 'ready'], ['2026-11-08', 'awaiting_advance'],
  ['2026-11-11', 'quote_sent'], ['2026-11-14', 'survey_done'], ['2026-11-17', 'survey_booked'], ['2026-11-19', 'qualified'],
  ['2026-11-20', 'contacted'], ['2026-11-21', 'new'],
];
const RANK = { new: 0, contacted: 1, qualified: 2, survey_booked: 3, survey_done: 4, quote_sent: 5, awaiting_advance: 6, ready: 7, dispatched: 8, installing: 9, done: 10 };
const ENQ_STATUS = { new: 'new', contacted: 'contacted', qualified: 'qualified', survey_booked: 'survey_scheduled', survey_done: 'survey_approved', quote_sent: 'quoted', lost: 'lost' };
const KWS = [3, 2, 4, 3, 5, 1, 3, 2, 3, 4];
const SOURCES = ['web', 'call', 'whatsapp', 'walk_in'];
const METHODS = ['upi', 'bank_transfer', 'cash', 'cheque', 'card'];
const DIRS = ['S', 'SW', 'SE', 'S', 'W'];

async function main() {
  const { rows: existing } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (existing[0].n > 0 && !RESET) throw new Error('The database already has data. Run "npm run db:reseed" to wipe everything and load the demo data again.');
  const hash = await bcrypt.hash(PASSWORD, 10);

  const summary = await tx(async (db) => {
    const q = async (text, params) => (await db.query(text, params)).rows;
    const q1 = async (text, params) => (await db.query(text, params)).rows[0];

    // ------------------------------------------------------------ wipe (only with --reset)
    if (RESET) {
      const tables = (await q("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'")).map((r) => `"${r.tablename}"`);
      await db.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
      for (const s of ['quote_seq', 'order_seq', 'invoice_seq', 'ticket_seq', 'po_seq']) await db.query(`ALTER SEQUENCE ${s} RESTART WITH 1`);
    }

    // ------------------------------------------------------------ staff, catalogue
    const U = {};
    for (const [name, email, role, rate] of STAFF) {
      const r = await q1('INSERT INTO users (name,email,password_hash,role,hourly_rate) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, email, hash, role, rate]);
      U[email.split('@')[0]] = r.id;
    }
    const techs = [U.tech1, U.tech2, U.tech3];
    const salesIds = [U.sales, U.sales2];

    const P = {};
    const price = {};
    for (const [sku, name, cat, tracked, war, cost, sell, reorder] of PRODUCTS) {
      const r = await q1('INSERT INTO products (sku,name,category,tracked_serial,warranty_months,cost_price,sell_price,reorder_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [sku, name, cat, tracked, war, cost, sell, reorder]);
      P[sku] = r.id;
      price[sku] = { sell, cost, name, tracked };
    }
    const PK = {};
    const mkPkg = async (name, kind, kw, desc, items) => {
      const r = await q1('INSERT INTO packages (name,kind,capacity_kw,description) VALUES ($1,$2,$3,$4) RETURNING id', [name, kind, kw, desc]);
      for (const [sku, n] of items) await db.query('INSERT INTO package_items (package_id,product_id,quantity) VALUES ($1,$2,$3)', [r.id, P[sku], n]);
      return r.id;
    };
    await mkPkg('Solar Panel Set (Hardware)', 'hardware', null, 'Solar panels, connectors and wires', [['PNL-540', 4], ['MC4', 4], ['CBL-DC', 20]]);
    for (const kw of [1, 2, 3, 4, 5]) {
      PK[`on_grid_${kw}`] = await mkPkg(`On-Grid System ${kw} kW`, 'on_grid', kw, 'Inverter, wiring boxes, charge controller, panels, earthing and stands', bom('on_grid', kw));
      PK[`off_grid_${kw}`] = await mkPkg(`Off-Grid System ${kw} kW`, 'off_grid', kw, 'Everything in On-Grid plus battery bank', bom('off_grid', kw));
    }
    await mkPkg('Installation (Service)', 'service', null, 'Fitting and testing by our crew', [['SVC-INSTALL', 1]]);

    // ------------------------------------------------------------ build the deals
    const deals = PLAN.map(([iso, stage], i) => {
      const [name, city] = NAMES[i];
      const kw = KWS[i % KWS.length];
      const type = i % 4 === 3 ? 'off_grid' : 'on_grid';
      const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
      return {
        i, name, city, kw, type, stage, d0: at(iso, 10, 30), iso,
        rank: stage === 'lost' ? -1 : RANK[stage],
        phone: `98250${10001 + i}`, email: `${slug}@example.com`,
        address: `${12 + i * 3}, ${SOCIETIES[i % SOCIETIES.length]}`,
        subsidy: type === 'on_grid' && i % 3 !== 2,
        source: SOURCES[i % SOURCES.length],
        sales: salesIds[i % 2], tech: techs[i % 3],
        discount: i % 5 === 4,
      };
    });

    // ------------------------------------------------------------ purchase orders sized to what gets shipped
    const PO_DATES = ['2026-06-01', '2026-08-05', '2026-10-02'];
    const needs = [];
    for (const d of deals) {
      if (d.rank < RANK.ready) continue;
      const when = d.rank >= RANK.dispatched ? ymd(plus(d.d0, 12)) : '2099-01-01'; // 'ready' orders will ship later
      for (const [sku, n] of bom(d.type, d.kw)) if (sku !== 'SVC-INSTALL') needs.push({ when, sku, n });
    }
    const BUFFER = { 'PNL-540': 14, 'INV-1K': 2, 'INV-2K': 2, 'INV-3K': 3, 'INV-4K': 1, 'INV-5K': 0, 'BAT-150': 0, 'MPPT-40A': 2, 'MPPT-60A': 3 };
    const window = (k) => needs.filter((x) => x.when >= PO_DATES[k] && (k === 2 || x.when < PO_DATES[k + 1]));
    const supplier = await q("INSERT INTO suppliers (name, phone) VALUES ('Sunrise Distributors Pvt Ltd','9825012345'), ('GreenVolt Components','9898098980') RETURNING id");
    const counters = {};
    const stockSummary = {};
    for (let k = 0; k < PO_DATES.length; k++) {
      const need = {};
      for (const x of window(k)) need[x.sku] = (need[x.sku] || 0) + x.n;
      const receivedAt = plus(at(PO_DATES[k], 12), 3);
      const po = await q1("INSERT INTO purchase_orders (supplier_id, status, ordered_at, received_at, created_by) VALUES ($1,'received',$2,$3,$4) RETURNING id",
        [supplier[k % 2].id, at(PO_DATES[k], 12), receivedAt, U.warehouse]);
      for (const [sku, , , tracked, , cost] of PRODUCTS) {
        if (sku === 'SVC-INSTALL') continue;
        let qty = need[sku] || 0;
        if (k === 0) qty += (tracked ? BUFFER[sku] ?? 0 : Math.ceil(qty * 0.25) + 5); // opening stock cushion
        else if (k === 2) qty += tracked ? 0 : Math.ceil(qty * 0.25) + 5;
        if (tracked && k === 2) qty += 0;
        if (qty <= 0) continue;
        await db.query('INSERT INTO purchase_order_items (po_id,product_id,quantity,unit_cost) VALUES ($1,$2,$3,$4)', [po.id, P[sku], qty, cost]);
        if (tracked) {
          const prefix = PRODUCTS.find((p) => p[0] === sku)[8];
          for (let n = 0; n < qty; n++) {
            counters[prefix] = (counters[prefix] || 0) + 1;
            await db.query("INSERT INTO inventory_units (product_id, serial_no, po_id, created_at) VALUES ($1,$2,$3,$4)", [P[sku], `${prefix}-${String(counters[prefix]).padStart(3, '0')}`, po.id, receivedAt]);
          }
        }
        await db.query("INSERT INTO stock_movements (product_id, qty, reason, ref_type, ref_id, created_by, created_at) VALUES ($1,$2,'purchase','po',$3,$4,$5)", [P[sku], qty, po.id, U.warehouse, receivedAt]);
        stockSummary[sku] = (stockSummary[sku] || 0) + qty;
      }
    }

    // ------------------------------------------------------------ helpers
    const act = (entity, id, action, userId, detail, when) =>
      db.query('INSERT INTO activity_log (entity, entity_id, action, user_id, detail, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)',
        [entity, id, action, userId, detail ? JSON.stringify(detail) : null, when]);

    const dispatchUnits = async (orderId, dispatchId, customerId, items, when) => {
      for (const [sku, n] of items) {
        if (sku === 'SVC-INSTALL') continue;
        if (price[sku].tracked) {
          const units = await q("SELECT id FROM inventory_units WHERE product_id = $1 AND status = 'in_stock' ORDER BY id LIMIT $2", [P[sku], n]);
          if (units.length < n) throw new Error(`Seed bug: not enough ${sku} in stock (${units.length}/${n})`);
          for (const u of units) {
            await db.query("UPDATE inventory_units SET status='dispatched', dispatch_id=$2, order_id=$3, customer_id=$4 WHERE id=$1", [u.id, dispatchId, orderId, customerId]);
            await db.query("INSERT INTO stock_movements (product_id, qty, reason, ref_type, ref_id, created_by, created_at) VALUES ($1,-1,'dispatch','dispatch',$2,$3,$4)", [P[sku], dispatchId, U.warehouse, when]);
          }
        } else {
          await db.query("INSERT INTO stock_movements (product_id, qty, reason, ref_type, ref_id, created_by, created_at) VALUES ($1,$2,'dispatch','dispatch',$3,$4,$5)", [P[sku], -n, dispatchId, U.warehouse, when]);
        }
      }
    };

    // ------------------------------------------------------------ run every deal in date order
    const delivered = []; // deals whose equipment is installed, used for tickets
    for (const d of deals) {
      const items = bom(d.type, d.kw);
      const lost = d.stage === 'lost';
      const rank = d.rank;

      // enquiry
      const checklist = rank >= 2 || lost;
      const enq = await q1(
        `INSERT INTO enquiries (customer_name, phone, email, address, city, requested_kw, system_type, subsidy_required, source, status, assigned_to,
                                shadow_free_sqft, monthly_bill, grid_suitable, qualification_notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [d.name, d.phone, d.email, d.address, d.city, d.kw, d.type, d.subsidy, d.source, lost ? 'lost' : rank >= 6 ? 'won' : ENQ_STATUS[d.stage], d.sales,
          checklist ? d.kw * 140 + 40 : null, checklist ? d.kw * 850 : null, checklist ? !lost : null, lost ? 'Roof is shaded most of the day. Not suitable.' : null, d.d0]);
      d.enqId = enq.id;
      await act('enquiry', enq.id, 'created', null, { source: d.source }, d.d0);
      if (rank >= 1 || lost) await act('enquiry', enq.id, 'call_logged:contacted', d.sales, null, plus(d.d0, 0, 15));
      if (rank >= 2) await act('enquiry', enq.id, 'call_logged:qualified', d.sales, null, plus(d.d0, 1, 12));
      if (lost) await act('enquiry', enq.id, 'call_logged:not_suitable', d.sales, { notes: 'Roof is shaded' }, plus(d.d0, 1, 12));

      // survey
      if (rank >= 3) {
        const done = rank >= 4;
        const date = ymd(done ? plus(d.d0, 3) : plus(d.d0, 6));
        await db.query(
          `INSERT INTO surveys (enquiry_id, technician_id, scheduled_date, status, roof_direction, roof_tilt_deg, cable_distance_m, usable_area_sqft, reviewed_by, completed_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [enq.id, d.tech, date, done ? 'approved' : 'scheduled', done ? DIRS[d.i % 5] : null, done ? 15 + (d.i % 4) * 3 : null, done ? 14 + (d.i % 6) * 3 : null,
            done ? d.kw * 140 + 40 : null, done ? d.sales : null, done ? plus(d.d0, 3, 15) : null, plus(d.d0, 1, 13)]);
        await act('enquiry', enq.id, 'survey_scheduled', d.sales, null, plus(d.d0, 1, 13));
        if (done) {
          await act('enquiry', enq.id, 'survey_submitted', d.tech, null, plus(d.d0, 3, 15));
          await act('enquiry', enq.id, 'survey_approved', d.sales, null, plus(d.d0, 3, 17));
        }
      }

      // quote
      if (rank >= 5) {
        const pkgId = PK[`${d.type}_${d.kw}`];
        const subtotal = round2(items.reduce((s, [sku, n]) => s + price[sku].sell * n, 0));
        const discount = d.discount ? Math.round(subtotal * 0.03) : 0;
        const tax = round2((subtotal - discount) * 0.05);
        const total = round2(subtotal - discount + tax);
        d.money = { subtotal, discount, tax, total };
        const quote = await q1(
          `INSERT INTO quotes (enquiry_id, package_id, status, subtotal, discount, tax_percent, tax_amount, total, valid_until, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,5,$6,$7,$8,$9,$10) RETURNING id`,
          [enq.id, pkgId, rank === 5 ? 'sent' : 'accepted', subtotal, discount, tax, total, ymd(plus(d.d0, 20)), d.sales, plus(d.d0, 5, 11)]);
        for (const [sku, n] of items) await db.query('INSERT INTO quote_items (quote_id,product_id,description,quantity,unit_price,unit_cost) VALUES ($1,$2,$3,$4,$5,$6)', [quote.id, P[sku], price[sku].name, n, price[sku].sell, price[sku].cost]);
        await act('enquiry', enq.id, 'quote_created', d.sales, { quoteId: quote.id, total }, plus(d.d0, 5, 11));
        await act('enquiry', enq.id, 'quote_sent', d.sales, { quoteId: quote.id }, plus(d.d0, 5, 16));
        d.quoteId = quote.id;
      }

      // order, invoice, subsidy
      if (rank >= 6) {
        const orderAt = plus(d.d0, 8, 11);
        const cust = await q1('INSERT INTO customers (name, phone, email, address, city, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [d.name, d.phone, d.email, d.address, d.city, orderAt]);
        d.custId = cust.id;
        await db.query('UPDATE enquiries SET customer_id = $2 WHERE id = $1', [enq.id, cust.id]);
        const confirmed = rank >= 7;
        const statusByRank = { 6: 'pending_payment', 7: 'confirmed', 8: 'dispatched', 9: 'delivered', 10: 'completed' };
        const order = await q1(
          'INSERT INTO orders (quote_id, customer_id, status, total, confirmed_at, completed_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [d.quoteId, cust.id, statusByRank[rank], d.money.total, confirmed ? plus(d.d0, 9, 12) : null, rank >= 10 ? plus(d.d0, 15, 17) : null, orderAt]);
        d.orderId = order.id;
        await db.query('INSERT INTO order_items (order_id,product_id,quantity,unit_price,unit_cost) SELECT $1, product_id, quantity, unit_price, unit_cost FROM quote_items WHERE quote_id = $2', [order.id, d.quoteId]);
        await act('order', order.id, 'created', d.sales, { quoteId: d.quoteId }, orderAt);

        const advance = Math.round(d.money.total * (0.3 + 0.05 * (d.i % 3)));
        const fullyPaid = rank >= 10;
        const invStatus = !confirmed ? 'sent' : fullyPaid ? 'paid' : 'partially_paid';
        const inv = await q1(
          `INSERT INTO invoices (kind, order_id, customer_id, status, subtotal, tax_amount, total, issued_at, due_date, created_at)
           VALUES ('order',$1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [order.id, cust.id, invStatus, d.money.subtotal - d.money.discount, d.money.tax, d.money.total, ymd(orderAt), ymd(plus(orderAt, 15)), orderAt]);
        await db.query('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) SELECT $1, description, quantity, unit_price FROM quote_items WHERE quote_id = $2', [inv.id, d.quoteId]);
        if (d.money.discount > 0) await db.query("INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) VALUES ($1,'Discount',1,$2)", [inv.id, -d.money.discount]);

        if (d.subsidy) {
          const ageDays = (new Date(`${TODAY}T12:00:00+05:30`) - orderAt) / DAY;
          const st = ageDays > 80 ? 'disbursed' : ageDays > 50 ? 'approved' : ageDays > 25 ? 'submitted' : 'documents_pending';
          const expected = subsidyFor(d.kw);
          await db.query(
            `INSERT INTO subsidy_applications (order_id, status, expected_amount, approved_amount, reference_no, submitted_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [order.id, st, expected, ['approved', 'disbursed'].includes(st) ? expected : null, st === 'documents_pending' ? null : `PMSG-2026-${String(70000 + d.i)}`,
              st === 'documents_pending' ? null : ymd(plus(orderAt, 10)), plus(orderAt, st === 'disbursed' ? 60 : 12)]);
        }

        if (confirmed) {
          const payAt = plus(d.d0, 9, 12);
          await db.query('INSERT INTO payments (invoice_id, amount, method, reference, received_by, paid_at) VALUES ($1,$2,$3,$4,$5,$6)',
            [inv.id, advance, METHODS[d.i % 5], `ADV-${String(1000 + d.i)}`, d.sales, payAt]);
          await act('order', order.id, 'confirmed', d.sales, { advancePercent: 30 }, payAt);

          const disp = await q1("INSERT INTO dispatches (order_id, created_at) VALUES ($1,$2) RETURNING id", [order.id, payAt]);
          d.dispId = disp.id;
          const job = await q1("INSERT INTO installation_jobs (order_id, status, scheduled_date, created_at) VALUES ($1,'scheduled',$2,$3) RETURNING id", [order.id, rank >= 9 && rank < 10 ? '2026-11-23' : ymd(plus(d.d0, 12)), payAt]);
          d.jobId = job.id;
          await db.query('INSERT INTO job_crew (job_id, user_id) VALUES ($1,$2)', [job.id, d.tech]);
          if (d.i % 2 === 0) await db.query('INSERT INTO job_crew (job_id, user_id) VALUES ($1,$2)', [job.id, techs[(d.i + 1) % 3]]);

          if (rank >= 8) {
            const shipAt = plus(d.d0, 12, 10);
            await dispatchUnits(order.id, disp.id, cust.id, items, shipAt);
            await db.query("UPDATE dispatches SET status='dispatched', vehicle_no=$2, dispatched_at=$3 WHERE id=$1", [disp.id, `GJ0${1 + (d.i % 9)}AB${1200 + d.i}`, shipAt]);
            await act('order', order.id, 'dispatched', U.warehouse, { vehicle: `GJ0${1 + (d.i % 9)}AB${1200 + d.i}` }, shipAt);
          }
          if (rank >= 9) {
            const arrive = plus(d.d0, 13, 11);
            await db.query("UPDATE dispatches SET status='delivered', delivered_at=$2 WHERE id=$1", [disp.id, arrive]); // trigger starts every warranty clock
            await act('order', order.id, 'delivered', U.warehouse, null, arrive);
          }
          if (rank >= 10) {
            const finish = plus(d.d0, 15, 16);
            const start = new Date(finish.getTime() - (5 + (d.i % 5)) * 3600e3);
            await db.query(
              `UPDATE installation_jobs SET status='completed', started_at=$2, finished_at=$3, confirmed_kw=$4, signer_name=$5, signature_data=$6, signed_at=$3 WHERE id=$1`,
              [job.id, start, finish, d.kw, d.name, 'data:image/png;base64,iVBORw0KGgo=']);
            await act('order', order.id, 'installation_signed_off', d.tech, { confirmedKw: d.kw }, finish);
            await db.query('INSERT INTO payments (invoice_id, amount, method, reference, received_by, paid_at) VALUES ($1,$2,$3,$4,$5,$6)',
              [inv.id, round2(d.money.total - advance), METHODS[(d.i + 1) % 5], `BAL-${String(2000 + d.i)}`, d.sales, plus(d.d0, 20, 14)]);
            delivered.push(d);
          }
        }
      }
    }

    // ------------------------------------------------------------ service tickets (all on equipment that is in warranty)
    const done = delivered;
    const unitOf = async (deal, sku) => q1('SELECT id, serial_no FROM inventory_units WHERE order_id = $1 AND product_id = $2 ORDER BY id LIMIT 1', [deal.orderId, P[sku]]);
    const TICKETS = [
      // [deal index in `done`, sku, subject, priority, status, daysAfterDelivery, fault code, resolution]
      [3, null, 'Inverter shows fault E04, no power', 'urgent', 'closed', 38, 'E04', 'Reset the DC input and replaced a loose MC4 connector.'],
      [8, null, 'Inverter display is blank after a power cut', 'normal', 'closed', 22, null, 'Display cable reseated and firmware refreshed.'],
      [12, null, 'Generation not visible in the mobile app', 'low', 'open', 14, null, null],
      [13, 'PNL-540', 'Cracked cover on a panel junction box', 'normal', 'open', 9, null, null],
      [15, null, 'Inverter beeps continuously in the evening', 'high', 'assigned', 6, 'E12', null],
      [14, null, 'Earthing alarm after heavy rain', 'normal', 'resolved', 8, 'E21', 'Earthing pit re-soaked and clamps tightened.'],
    ];
    for (const [idx, sku, subject, priority, status, after, code, resolution] of TICKETS) {
      const deal = done[Math.min(idx, done.length - 1)];
      const invSku = sku || `INV-${deal.kw}K`;
      const unit = await unitOf(deal, invSku);
      const opened = plus(deal.d0, 13 + after, 10);
      if (opened > new Date(`${TODAY}T20:00:00+05:30`)) continue;
      const assignee = status === 'open' ? null : status === 'assigned' ? U.tech1 : U.support;
      const t = await q1(
        `INSERT INTO tickets (customer_id, unit_id, subject, description, fault_code, priority, status, warranty_status, assigned_to, resolution, resolved_at, customer_confirmed_at, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'in_warranty',$8,$9,$10,$11,$12,$13) RETURNING id`,
        [deal.custId, unit.id, subject, 'Reported by the customer over the phone.', code, priority, status, assignee, resolution,
          ['resolved', 'closed'].includes(status) ? plus(opened, 2, 15) : null, status === 'closed' ? plus(opened, 4, 12) : null, U.support, opened]);
      await act('ticket', t.id, 'created', U.support, { warranty: 'in_warranty' }, opened);
      if (['resolved', 'closed'].includes(status)) {
        await db.query("INSERT INTO ticket_lines (ticket_id, description, quantity, unit_price, unit_cost, is_labour) VALUES ($1,'Technician visit and testing',1,500,0,true)", [t.id]);
        await db.query('INSERT INTO ticket_lines (ticket_id, product_id, description, quantity, unit_price, unit_cost, is_labour) VALUES ($1,$2,$3,2,120,80,false)', [t.id, P['MC4'], 'MC4 Connector Pair']);
        await act('ticket', t.id, 'resolved', U.support, { free: true }, plus(opened, 2, 15));
      }
    }

    // ------------------------------------------------------------ technician payouts (Jun to Oct paid, November pending)
    await db.query(
      `INSERT INTO technician_payouts (user_id, period_month, hours, amount, status, paid_at)
       SELECT u.id, date_trunc('month', j.finished_at)::date, COALESCE(SUM(l.hours),0), COALESCE(SUM(l.hours * u.hourly_rate),0),
              CASE WHEN date_trunc('month', j.finished_at) < date '2026-11-01' THEN 'paid'::payout_status ELSE 'pending'::payout_status END,
              CASE WHEN date_trunc('month', j.finished_at) < date '2026-11-01' THEN (date_trunc('month', j.finished_at) + interval '1 month' + interval '5 days') END
         FROM users u JOIN job_crew c ON c.user_id = u.id
         JOIN installation_jobs j ON j.id = c.job_id AND j.status = 'completed'
         JOIN v_job_labour l ON l.job_id = j.id
        WHERE u.role = 'technician' GROUP BY u.id, date_trunc('month', j.finished_at)`);

    // ------------------------------------------------------------ what to scan next
    const ready = deals.filter((d) => d.rank === RANK.ready);
    const next = {};
    for (const [sku, , , tracked, , , , , prefix] of PRODUCTS) {
      if (!tracked) continue;
      const rows = await q("SELECT serial_no FROM inventory_units WHERE product_id = $1 AND status = 'in_stock' ORDER BY id LIMIT 3", [P[sku]]);
      next[sku] = rows.map((r) => r.serial_no);
    }
    return { deals: deals.length, ready: ready.map((d) => `${d.name} (${d.phone})`), next, counters };
  });

  console.log('Seed complete: 6 months of data (June to 21 November 2026).');
  console.log(`Customer journeys: ${summary.deals}. Customer mobile numbers: 9825010001 ... 98250100${String(summary.deals).padStart(2, '0')}`);
  console.log('Orders waiting for the warehouse to scan:', summary.ready.join('; '));
  console.log('Next serials to scan (lowest number still in stock):');
  for (const [sku, list] of Object.entries(summary.next)) console.log(`  ${sku.padEnd(9)} ${list.join(', ')}`);
  console.log(`Logins: ${STAFF.map((s) => s[1]).join(', ')}\nPassword for all: ${PASSWORD}`);
}

main().then(() => pool.end()).catch((e) => { console.error(e); pool.end(); process.exit(1); });
