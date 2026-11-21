// @ts-nocheck
// One year of realistic business data (23 Nov 2025 to 22 Nov 2026) for a solar installer in Gujarat.
// Work is attributed to the staff already in the system (sales, technicians, warehouse, support); staff rows are only read.
//   npm run db:year
// It adds data only. It never touches the staff table: every staff field points at the one admin account,
// and it refuses to run if the database already holds enquiries, so it cannot duplicate or overwrite anything.
// The numbers are generated from a fixed seed, so the same data comes out every time.
import 'dotenv/config';
import { Pool } from 'pg';
import { env } from '../../src/config/env';

const pool = new Pool({ connectionString: env.databaseUrl });
const N_ENQUIRIES = 560;
const NOW = Math.min(Date.parse('2026-11-22T12:00:00+05:30'), Date.now()); // never later than the real clock
const START = '2025-11-23';

// ------------------------------------------------------------------ random helpers (fixed seed)
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry(20261122);
const between = (a, b) => Math.floor(rnd() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ------------------------------------------------------------------ dates (India time)
const addIso = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const two = (n) => String(n).padStart(2, '0');
const mk = (iso, h, m) => ({ iso, h, m, date: new Date(`${iso}T${two(h)}:${two(m)}:00+05:30`) });
/** The next event: `days` later (or the same day, a little later), during working hours. */
const step = (prev, days, hmin = 9, hmax = 18) => {
  const iso = addIso(prev.iso, days);
  const h = days === 0 ? Math.min(prev.h + between(1, 2), 21) : between(hmin, hmax);
  return mk(iso, h, between(0, 59));
};
const done = (ev) => ev && ev.date.getTime() <= NOW;
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const MONTHS = [['2025-11', 3], ['2025-12', 8], ['2026-01', 9], ['2026-02', 10], ['2026-03', 11], ['2026-04', 11], ['2026-05', 10], ['2026-06', 8], ['2026-07', 6], ['2026-08', 6], ['2026-09', 7], ['2026-10', 9], ['2026-11', 6]];
function enquiryDay() {
  const ym = weighted(MONTHS);
  const first = ym === '2025-11' ? START : `${ym}-01`;
  const last = ym === '2026-11' ? '2026-11-21' : addIso(`${ym}-01`, 27);
  const span = Math.round((Date.parse(last) - Date.parse(first)) / 864e5);
  return addIso(first, between(0, Math.max(span, 0)));
}

// ------------------------------------------------------------------ people and places
const FIRST = ['Ramesh', 'Suresh', 'Mahesh', 'Dinesh', 'Jignesh', 'Nilesh', 'Hitesh', 'Paresh', 'Kalpesh', 'Bhavesh', 'Rakesh', 'Mukesh', 'Chirag', 'Hardik', 'Jay', 'Parth', 'Smit', 'Dhruv', 'Yash', 'Harsh', 'Nirav', 'Kunal', 'Vishal', 'Ketan', 'Tushar', 'Rahul', 'Amit', 'Sanjay', 'Vijay', 'Ajay', 'Manoj', 'Pankaj', 'Alpesh', 'Mitesh', 'Hemant', 'Bharat', 'Kirit', 'Jayesh', 'Naresh', 'Ashok', 'Priya', 'Pooja', 'Neha', 'Komal', 'Hetal', 'Nisha', 'Anita', 'Sunita', 'Kavita', 'Reena', 'Mina', 'Foram', 'Jigna', 'Dipti', 'Bhumi', 'Riddhi', 'Krupa', 'Payal', 'Isha', 'Sejal'];
const LAST = ['Patel', 'Shah', 'Desai', 'Mehta', 'Joshi', 'Trivedi', 'Parmar', 'Solanki', 'Rana', 'Thakkar', 'Bhatt', 'Dave', 'Amin', 'Vyas', 'Chauhan', 'Panchal', 'Gandhi', 'Soni', 'Jani', 'Raval', 'Dalal', 'Barot', 'Kothari', 'Modi', 'Vora', 'Gajjar', 'Pandya', 'Brahmbhatt', 'Kapadia', 'Mistry', 'Rathod', 'Zala', 'Jadeja', 'Makwana', 'Chavda', 'Prajapati', 'Sheth', 'Nayak', 'Doshi', 'Parikh'];
const CITIES = [['Ahmedabad', 28], ['Surat', 22], ['Vadodara', 16], ['Rajkot', 12], ['Gandhinagar', 8], ['Bharuch', 4], ['Anand', 4], ['Bhavnagar', 3], ['Jamnagar', 3]];
const AREAS = {
  Ahmedabad: ['Satellite', 'Bopal', 'Maninagar', 'Naranpura', 'Vastrapur', 'Chandkheda', 'Gota', 'Thaltej', 'Naroda', 'Nikol'],
  Surat: ['Adajan', 'Vesu', 'Pal', 'Varachha', 'Katargam', 'Piplod', 'Udhna', 'Althan'],
  Vadodara: ['Alkapuri', 'Manjalpur', 'Gotri', 'Akota', 'Waghodia Road', 'Karelibaug'],
  Rajkot: ['Kalawad Road', 'University Road', 'Mavdi', 'Raiya Road', 'Gondal Road'],
  Gandhinagar: ['Sector 21', 'Sector 7', 'Kudasan', 'Sargasan', 'Raysan'],
  Bharuch: ['Zadeshwar', 'Station Road', 'Dahej Bypass'],
  Anand: ['Vidyanagar', 'Lambhvel Road', 'Borsad Chokdi'],
  Bhavnagar: ['Kaliyabid', 'Waghawadi Road', 'Sidsar'],
  Jamnagar: ['Patel Colony', 'Ranjit Road', 'Pandit Nehru Marg'],
};
const SOCIETIES = ['Shanti Nagar', 'Sunrise Society', 'Green Park', 'Maple Residency', 'Lotus Heights', 'Orchid Villas', 'Krishna Bungalows', 'Shreeji Park', 'Ganesh Apartments', 'Narmada Row Houses', 'Aashirvad Duplex', 'Riverside Homes', 'Kailash Society', 'Tulsi Tenaments', 'Gopal Residency', 'Madhav Villa'];
const usedPhones = new Set();
function phone() {
  for (;;) {
    const p = pick(['98', '97', '99', '96', '94', '90', '95', '63', '70', '88']) + String(between(10000000, 99999999));
    if (!usedPhones.has(p) && !/(\d)\1{5}/.test(p)) { usedPhones.add(p); return p; }
  }
}
const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '.');

// ------------------------------------------------------------------ catalogue helpers
const SUBSIDY = (kw) => (kw >= 3 ? 78000 : kw >= 2 ? 60000 : 30000);
const METHODS = [['upi', 40], ['bank_transfer', 30], ['cheque', 12], ['cash', 10], ['card', 8]];
const DIRS = ['S', 'S', 'S', 'SW', 'SE', 'W', 'E'];
const PREFIX = { 'PNL-540': 'PNL', 'INV-1K': 'INV1', 'INV-2K': 'INV2', 'INV-3K': 'INV3', 'INV-4K': 'INV4', 'INV-5K': 'INV5', 'BAT-150': 'BAT', 'MPPT-40A': 'MC40', 'MPPT-60A': 'MC60' };
const EXTRAS = [['CBL-DC', 10, 40], ['CBL-AC', 8, 25], ['MC4', 2, 6], ['MCB-SW', 1, 2], ['EARTH-KIT', 1, 1], ['STAND-AL', 1, 3], ['PNL-540', 1, 2]];
const FAULTS = [
  ['Inverter shows fault E04 and gives no power', 'E04'], ['Inverter beeps continuously in the evening', 'E12'], ['Display is blank after a power cut', null],
  ['Generation not visible in the mobile app', null], ['Earthing alarm after heavy rain', 'E21'], ['Inverter restarts again and again at noon', 'E07'],
  ['Battery backup runs out within an hour', null], ['Cracked cover on the panel junction box', null], ['Low generation compared to last month', null],
  ['Grid fault light stays on', 'E15'], ['Loose cable at the DC box', null], ['Panel hot spot noticed after cleaning', null],
];

async function main() {
  const db = await pool.connect();
  const q = async (text, params) => (await db.query(text, params)).rows;
  const q1 = async (text, params) => (await db.query(text, params)).rows[0];
  const ins = async (table, row, returning = 'id') => {
    const cols = Object.keys(row).filter((k) => row[k] !== undefined);
    const vals = cols.map((k) => row[k]);
    const r = await db.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})${returning ? ` RETURNING ${returning}` : ''}`, vals);
    return returning ? r.rows[0][returning] : null;
  };
  const act = (entity, id, action, when, detail = null, user = A) => ins('activity_log', { entity, entity_id: id, action, user_id: user, detail: detail ? JSON.stringify(detail) : null, created_at: new Date(Math.min((when.date ?? when).getTime(), NOW)) }, null);

  const admin = await q1("select id from users where role = 'admin' order by id limit 1");
  if (!admin) throw new Error('There is no admin account. Create one first.');
  const A = admin.id; // staff is never changed; real staff are only read, to attribute the work
  const staff = {};
  for (const u of await q("select id, role from users where active order by id")) (staff[u.role] ||= []).push(u.id);
  const sales = staff.sales?.length ? staff.sales : [A];
  const techs = staff.technician?.length ? staff.technician : [A];
  const WH = (staff.warehouse || [A])[0];
  const SUP = staff.support?.length ? staff.support : [A];
  console.log(`  using ${sales.length} salespeople, ${techs.length} technicians, warehouse and support staff already in the system`);
  if ((await q1('select count(*)::int n from enquiries')).n > 0) throw new Error('The database already has enquiries. This script only fills an empty database.');

  const products = Object.fromEntries((await q('select id, sku, name, tracked_serial, sell_price::float sell, cost_price::float cost, warranty_months from products where active')).map((p) => [p.sku, p]));
  if (!products['PNL-540']) throw new Error('Load the product catalogue first: npm run db:catalog');
  const pkgRows = await q(`SELECT pk.id, pk.kind, pk.capacity_kw::int kw, json_agg(json_build_object('sku', p.sku, 'qty', pi.quantity)) AS items
                             FROM packages pk JOIN package_items pi ON pi.package_id = pk.id JOIN products p ON p.id = pi.product_id
                            WHERE pk.active AND pk.kind IN ('on_grid','off_grid') GROUP BY pk.id`);
  const pkgs = {};
  for (const r of pkgRows) pkgs[`${r.kind}_${r.kw}`] = r;

  // ================================================================== 1. plan every enquiry
  const deals = [];
  for (let i = 0; i < N_ENQUIRIES; i++) {
    const city = weighted(CITIES);
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const kw = weighted([[1, 8], [2, 22], [3, 38], [4, 20], [5, 12]]);
    const type = chance(0.78) ? 'on_grid' : 'off_grid';
    const created = mk(enquiryDay(), between(9, 20), between(0, 59));
    const d = {
      name, city, kw, type, phone: phone(), created,
      email: chance(0.55) ? `${slug(name)}${chance(0.4) ? between(1, 99) : ''}@${pick(['gmail.com', 'gmail.com', 'gmail.com', 'yahoo.com', 'outlook.com'])}` : null,
      address: `${between(1, 420)}, ${pick(SOCIETIES)}, ${pick(AREAS[city])}`,
      source: weighted([['web', 38], ['call', 25], ['whatsapp', 20], ['walk_in', 10]]),
      subsidy: type === 'on_grid' && chance(0.72),
      message: chance(0.18) ? pick(['Please call after 6 pm.', 'Terrace is on the second floor.', 'We want to cut the electricity bill before summer.', 'Neighbour recommended you.', 'Is net metering available in our area?', 'Need backup for frequent power cuts.']) : null,
      discount: chance(0.2) ? pick([0.02, 0.03, 0.04, 0.05]) : 0,
      outcome: weighted([['won', 41], ['unsuitable', 10], ['rejected', 8], ['ghosted', 14], ['open', 27]]),
      ev: {},
    };
    d.sales = pick(sales);
    deals.push(d);
  }
  deals.sort((a, b) => a.created.date - b.created.date);
  // one installation a day per technician, or up to three surveys (the same rule the app enforces)
  const instBusy = {}, surveys = {};
  const freeTech = (iso, forInstall = false) => techs.find((t) => !instBusy[`${t}${iso}`] && (surveys[`${t}${iso}`] || 0) < (forInstall ? 1 : 3));

  for (const d of deals) {
    const e = d.ev;
    e.contacted = step(d.created, between(0, 1));
    e.qualified = step(e.contacted, between(0, 2));
    e.booked = step(e.qualified, between(0, 1));
    let sDay = addIso(e.booked.iso, between(2, 6));
    while (!freeTech(sDay)) sDay = addIso(sDay, 1);
    d.tech = freeTech(sDay);
    surveys[`${d.tech}${sDay}`] = (surveys[`${d.tech}${sDay}`] || 0) + 1;
    e.survey = mk(sDay, between(10, 16), between(0, 59));
    e.approved = step(e.survey, between(0, 1), 10, 18);
    e.quoted = step(e.approved, between(1, 3));
    e.sent = step(e.quoted, 0);
    e.response = step(e.sent, between(2, 12));
    e.order = e.response;
    e.advance = step(e.order, between(0, 3));
    e.ship = step(e.advance, between(4, 10));
    e.deliver = step(e.ship, between(1, 3));
    e.assigned = step(e.deliver, between(0, 2));
    let gap = between(1, 4);
    e.installed = step(e.assigned, gap, 15, 19);
    if (d.outcome === 'won') {
      while (!freeTech(e.installed.iso, true)) e.installed = step(e.assigned, ++gap, 15, 19);
      d.instTech = freeTech(e.installed.iso, true);
      instBusy[`${d.instTech}${e.installed.iso}`] = 1;
    } else d.instTech = techs[0];
    e.balance = step(e.installed, between(3, 30));
    // how far does it get before today
    let stage = 'new';
    if (done(e.contacted)) stage = 'contacted';
    if (d.outcome === 'unsuitable') { stage = done(e.qualified) ? 'lost' : stage; }
    else if (d.outcome !== 'open' || true) {
      if (done(e.qualified)) stage = 'qualified';
      if (done(e.booked)) stage = 'booked';
      if (done(e.approved)) stage = 'approved';
      if (done(e.sent)) stage = 'quoted';
      // open leads stall after the call or the survey; they are the recent ones in practice
      if (d.outcome === 'open') {
        const stall = weighted([['qualified', 3], ['booked', 3], ['approved', 2], ['quoted', 4]]);
        const order = ['new', 'contacted', 'qualified', 'booked', 'approved', 'quoted'];
        if (order.indexOf(stage) > order.indexOf(stall) && ((NOW - d.created.date) / 864e5) < 40) stage = stall;
        else if (order.indexOf(stage) >= order.indexOf('quoted') && ((NOW - d.created.date) / 864e5) >= 40) d.outcome = 'ghosted';
      }
    }
    d.stage = stage;
    d.hasQuote = ['quoted'].includes(stage) && done(e.sent);
    d.quoteStatus = null; d.won = false; d.lost = stage === 'lost';
    if (d.hasQuote) {
      if (d.outcome === 'won' && done(e.response)) { d.quoteStatus = 'accepted'; d.won = true; }
      else if (d.outcome === 'rejected' && done(e.response)) d.quoteStatus = 'rejected';
      else d.quoteStatus = NOW > Date.parse(addIso(e.sent.iso, 15)) ? 'expired' : 'sent';
    }
    // order timeline
    d.orderStatus = null;
    if (d.won) {
      const paid = !(chance(0.04) && (NOW - e.order.date) / 864e5 > 20) && (done(e.advance) || false);
      if (!paid) d.orderStatus = (NOW - e.order.date) / 864e5 > 20 ? 'cancelled' : 'pending_payment';
      else if (!done(e.ship)) d.orderStatus = 'confirmed';
      else if (!done(e.deliver)) d.orderStatus = 'dispatched';
      else if (!done(e.installed)) d.orderStatus = 'delivered';
      else d.orderStatus = 'completed';
    }
    d.shipped = ['dispatched', 'delivered', 'completed'].includes(d.orderStatus);
    d.delivered = ['delivered', 'completed'].includes(d.orderStatus);
    // delivered jobs: the technician is assigned after delivery; the newest ones are still waiting
    d.assignedDone = d.delivered && done(e.assigned);
    // bill of materials from the package, plus the odd extra
    if (d.hasQuote) {
      const pkg = pkgs[`${d.type}_${d.kw}`];
      const items = new Map(pkg.items.map((x) => [x.sku, x.qty]));
      if (chance(0.22)) for (let k = 0; k < between(1, 2); k++) { const [sku, lo, hi] = pick(EXTRAS); items.set(sku, (items.get(sku) || 0) + between(lo, hi)); }
      d.pkgId = pkg.id;
      d.bom = [...items.entries()].map(([sku, qty]) => ({ sku, qty, p: products[sku] }));
      const subtotal = round2(d.bom.reduce((s, x) => s + x.p.sell * x.qty, 0));
      d.discountAmt = Math.round(subtotal * d.discount);
      d.tax = round2((subtotal - d.discountAmt) * 0.05);
      d.subtotal = subtotal; d.total = round2(subtotal - d.discountAmt + d.tax);
    }
  }

  // document numbers: one counter per calendar year, in date order
  const counters = {};
  const nextNo = (prefix, date) => {
    const y = ymd(date).slice(0, 4);
    counters[`${prefix}${y}`] = (counters[`${prefix}${y}`] || 0) + 1;
    return `${prefix}-${y}-${String(counters[`${prefix}${y}`]).padStart(4, '0')}`;
  };
  for (const d of [...deals].filter((x) => x.hasQuote).sort((a, b) => a.ev.quoted.date - b.ev.quoted.date)) d.quoteNo = nextNo('Q', d.ev.quoted.date);
  const ordered = deals.filter((x) => x.orderStatus);
  for (const d of [...ordered].sort((a, b) => a.ev.order.date - b.ev.order.date)) { d.orderNo = nextNo('SO', d.ev.order.date); d.invoiceNo = nextNo('INV', d.ev.order.date); }

  // ================================================================== 2. suppliers and monthly purchases
  await db.query('BEGIN');
  try {
    const sup = [];
    for (const [n, ph, em] of [['Sunrise Distributors Pvt Ltd', '9825012345', 'sales@sunrisedistributors.in'], ['GreenVolt Components', '9898098980', 'orders@greenvolt.in'], ['Gujarat Solar Traders', '9879055511', null]]) sup.push(await ins('suppliers', { name: n, phone: ph, email: em }));
    const receipts = [];
    for (let m = 0; m < 12; m++) { const ym = addIso('2025-12-01', 0).slice(0, 7); void ym; }
    for (const iso of ['2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']) receipts.push(iso);
    const windowOf = (date) => { const iso = ymd(date); let k = 0; for (let i = 0; i < receipts.length; i++) if (iso >= receipts[i]) k = i; return k; };
    const need = receipts.map(() => ({}));
    for (const d of deals) if (d.shipped) for (const x of d.bom) need[windowOf(d.ev.ship.date)][x.sku] = (need[windowOf(d.ev.ship.date)][x.sku] || 0) + x.qty;
    const counter = {};
    const unitNo = (sku) => { counter[sku] = (counter[sku] || 0) + 1; return `${PREFIX[sku]}-${String(counter[sku]).padStart(4, '0')}`; };
    const poCount = {};
    for (let k = 0; k < receipts.length; k++) {
      const recv = mk(receipts[k], 8, 30);
      const ordered = mk(addIso(receipts[k], -4), 11, 0);
      const poNo = nextNo('PO', recv.date);
      const po = await ins('purchase_orders', { po_no: poNo, supplier_id: sup[k % 3], status: 'received', ordered_at: ordered.date, received_at: recv.date, created_by: WH });
      for (const sku of Object.keys(products)) {
        const p = products[sku];
        if (sku === 'SVC-INSTALL') continue;
        const n = need[k][sku] || 0;
        const last = k === receipts.length - 1;
        let qty;
        if (p.tracked_serial) { const buf = sku === 'PNL-540' ? 10 : sku === 'BAT-150' || sku === 'MPPT-40A' ? (last ? 0 : 1) : 1; qty = n + buf; }
        else qty = n + Math.ceil(n * 0.12) + 15;
        if (qty <= 0) continue;
        await ins('purchase_order_items', { po_id: po, product_id: p.id, quantity: qty, unit_cost: p.cost }, null);
        if (p.tracked_serial) for (let i = 0; i < qty; i++) await ins('inventory_units', { product_id: p.id, serial_no: unitNo(sku), po_id: po, created_at: recv.date }, null);
        await ins('stock_movements', { product_id: p.id, qty, reason: 'purchase', ref_type: 'po', ref_id: po, created_by: WH, created_at: recv.date }, null);
      }
      await act('purchase_order', po, 'received', recv, null, WH);
      poCount[poNo] = 1;
    }
    console.log('  purchases and stock loaded');

    // ================================================================ 3. enquiries, surveys, quotes, orders, money
    for (const d of deals) {
      const e = d.ev;
      const lastEvent = d.won ? (d.delivered ? e.installed : e.advance) : d.hasQuote ? e.sent : d.stage === 'booked' || d.stage === 'approved' ? e.approved : d.created;
      const qualified = ['qualified', 'booked', 'approved', 'quoted'].includes(d.stage) || d.lost;
      d.closedAfterQuote = d.hasQuote && ['rejected', 'expired'].includes(d.quoteStatus);
      const status = d.lost || d.closedAfterQuote ? 'lost' : d.won || d.orderStatus ? 'won' : d.stage === 'quoted' ? 'quoted' : d.stage === 'approved' ? 'survey_approved' : d.stage === 'booked' ? 'survey_scheduled' : d.stage === 'qualified' ? 'qualified' : d.stage === 'contacted' ? 'contacted' : 'new';
      d.id = await ins('enquiries', {
        customer_name: d.name, phone: d.phone, email: d.email, address: d.address, city: d.city, requested_kw: d.kw, system_type: d.type,
        subsidy_required: d.subsidy, message: d.message, source: d.source, status, assigned_to: d.sales,
        shadow_free_sqft: qualified ? d.kw * between(120, 170) + between(20, 80) : null, monthly_bill: qualified ? d.kw * between(700, 1000) : null,
        grid_suitable: qualified ? !d.lost : null, qualification_notes: d.closedAfterQuote ? (d.quoteStatus === 'rejected' ? pick(['Customer chose another installer.', 'Price was higher than expected.', 'Customer postponed the decision to next year.']) : 'Quote expired without a reply.') : d.lost ? pick(['Roof is shaded most of the day.', 'Society does not allow rooftop panels.', 'Customer is shifting house soon.', 'Roof is asbestos sheet and too weak.']) : null,
        created_at: d.created.date, updated_at: (lastEvent.date ?? d.created.date),
      });
      await act('enquiry', d.id, 'created', d.created, { source: d.source }, d.source === 'web' ? null : d.sales);
      if (done(e.contacted)) await act('enquiry', d.id, 'call_logged:contacted', e.contacted, null, d.sales);
      if (d.lost) { await act('enquiry', d.id, 'call_logged:not_suitable', e.qualified, { notes: 'Not suitable' }, d.sales); continue; }
      if (qualified) await act('enquiry', d.id, 'call_logged:qualified', e.qualified, null, d.sales);

      // survey
      if (d.stage === 'booked' || d.stage === 'approved' || d.stage === 'quoted') {
        const surveyDone = done(e.survey);
        const approved = done(e.approved) && surveyDone;
        await ins('surveys', {
          enquiry_id: d.id, technician_id: d.tech, scheduled_date: e.survey.iso, status: approved ? 'approved' : surveyDone ? 'completed' : 'scheduled',
          roof_direction: surveyDone ? pick(DIRS) : null, roof_tilt_deg: surveyDone ? between(10, 28) : null, cable_distance_m: surveyDone ? between(8, 45) : null,
          usable_area_sqft: surveyDone ? d.kw * between(110, 150) + between(10, 60) : null, reviewed_by: approved ? d.sales : null,
          completed_at: surveyDone ? e.survey.date : null, created_at: e.booked.date,
        }, null);
        await act('enquiry', d.id, 'survey_scheduled', e.booked, null, d.sales);
        if (surveyDone) await act('enquiry', d.id, 'survey_submitted', e.survey, null, d.tech);
        if (approved) await act('enquiry', d.id, 'survey_approved', e.approved, null, d.sales);
      }
      if (!d.hasQuote) continue;

      // quote
      const quoteId = await ins('quotes', {
        quote_no: d.quoteNo, enquiry_id: d.id, package_id: d.pkgId, status: d.quoteStatus, subtotal: d.subtotal, discount: d.discountAmt, tax_percent: 5,
        tax_amount: d.tax, total: d.total, valid_until: addIso(e.sent.iso, 15), created_by: d.sales, created_at: e.quoted.date,
      });
      for (const x of d.bom) await ins('quote_items', { quote_id: quoteId, product_id: x.p.id, description: x.p.name, quantity: x.qty, unit_price: x.p.sell, unit_cost: x.p.cost }, null);
      await act('enquiry', d.id, 'quote_created', e.quoted, { quoteId, total: d.total }, d.sales);
      await act('enquiry', d.id, 'quote_sent', e.sent, { quoteId }, d.sales);
      if (!d.orderStatus) continue;

      // customer, order, invoice
      const cust = await ins('customers', { name: d.name, phone: d.phone, email: d.email, address: d.address, city: d.city, created_at: e.order.date });
      await db.query('UPDATE enquiries SET customer_id = $2 WHERE id = $1', [d.id, cust]);
      d.cust = cust;
      const paidSome = ['confirmed', 'dispatched', 'delivered', 'completed'].includes(d.orderStatus);
      d.orderId = await ins('orders', {
        order_no: d.orderNo, quote_id: quoteId, customer_id: cust, status: d.orderStatus, total: d.total,
        confirmed_at: paidSome ? e.advance.date : null, completed_at: d.orderStatus === 'completed' ? e.installed.date : null, created_at: e.order.date,
      });
      await db.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost) SELECT $1, product_id, quantity, unit_price, unit_cost FROM quote_items WHERE quote_id = $2', [d.orderId, quoteId]);
      await act('order', d.orderId, 'created', e.order, { quoteId }, d.sales);

      const advancePct = pick([0.3, 0.3, 0.4, 0.5]);
      const advance = Math.round(d.total * advancePct);
      const balance = round2(d.total - advance);
      const balancePaid = d.orderStatus === 'completed' && done(e.balance) && chance(0.88);
      const invStatus = d.orderStatus === 'cancelled' ? 'void' : !paidSome ? 'sent' : balancePaid ? 'paid' : 'partially_paid';
      const invoiceId = await ins('invoices', {
        invoice_no: d.invoiceNo, kind: 'order', order_id: d.orderId, customer_id: cust, status: invStatus, subtotal: round2(d.subtotal - d.discountAmt), tax_amount: d.tax, total: d.total,
        issued_at: e.order.iso, due_date: addIso(e.order.iso, 15), created_at: e.order.date,
      });
      await db.query('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) SELECT $1, description, quantity, unit_price FROM quote_items WHERE quote_id = $2', [invoiceId, quoteId]);
      if (d.discountAmt > 0) await ins('invoice_items', { invoice_id: invoiceId, description: 'Discount', quantity: 1, unit_price: -d.discountAmt }, null);
      const pay = async (amount, when) => { const m = weighted(METHODS); await ins('payments', { invoice_id: invoiceId, amount, method: m, reference: m === 'cash' ? null : `${m === 'upi' ? 'UPI' : m === 'cheque' ? 'CHQ' : 'UTR'}${between(100000000, 999999999)}`, received_by: d.sales, paid_at: new Date(Math.min(when.date.getTime(), NOW)) }, null); };
      if (paidSome) {
        await pay(advance, e.advance);
        await act('order', d.orderId, 'confirmed', e.advance, { advancePercent: Math.round(advancePct * 100) }, d.sales);
        d.dispatchId = await ins('dispatches', { order_id: d.orderId, created_at: e.advance.date });
        d.jobId = await ins('installation_jobs', { order_id: d.orderId, created_at: e.advance.date });
        if (balancePaid) {
          if (chance(0.15)) { const first = Math.round(balance / 2); await pay(first, step(e.installed, between(1, 6))); await pay(round2(balance - first), e.balance); } else await pay(balance, e.balance);
        } else if (d.orderStatus === 'completed' && done(e.balance) === false && chance(0.5)) { /* balance still due */ }
        else if (d.orderStatus === 'completed' && chance(0.3)) await pay(Math.round(balance * 0.5), step(e.installed, between(2, 10)));
        // fix the status when only part of the balance came in
        const got = (await q1('select coalesce(sum(amount),0)::float s from payments where invoice_id = $1', [invoiceId])).s;
        const real = got >= d.total - 0.01 ? 'paid' : 'partially_paid';
        if (real !== invStatus) await db.query('UPDATE invoices SET status = $2::invoice_status WHERE id = $1', [invoiceId, real]);
      }
      // subsidy
      if (d.subsidy && d.type === 'on_grid' && d.orderStatus !== 'cancelled') {
        const age = (NOW - e.order.date) / 864e5;
        const submitted = age > 12, approved = age > 55, disbursed = age > 95;
        const rejected = submitted && chance(0.05);
        const st = rejected ? 'rejected' : disbursed ? 'disbursed' : approved ? 'approved' : submitted ? 'submitted' : 'documents_pending';
        const exp = SUBSIDY(d.kw);
        await ins('subsidy_applications', {
          order_id: d.orderId, status: st, expected_amount: exp, approved_amount: ['approved', 'disbursed'].includes(st) ? exp : null,
          reference_no: submitted ? `PMSG-GJ-${between(100000, 999999)}` : null, submitted_at: submitted ? addIso(e.order.iso, between(7, 12)) : null, updated_at: new Date(Math.min(NOW, e.order.date.getTime() + (disbursed ? 95 : approved ? 55 : submitted ? 12 : 1) * 864e5)),
        }, null);
      }
    }
    console.log('  enquiries, quotes, orders, invoices and payments loaded');

    // ================================================================ 4. dispatch, delivery and installation, in shipping order
    const shipments = deals.filter((x) => x.shipped).sort((a, b) => a.ev.ship.date - b.ev.ship.date);
    for (const d of shipments) {
      const e = d.ev;
      for (const x of d.bom) {
        if (x.p.tracked_serial) {
          const units = await q("SELECT id FROM inventory_units WHERE product_id = $1 AND status = 'in_stock' ORDER BY id LIMIT $2", [x.p.id, x.qty]);
          if (units.length < x.qty) throw new Error(`Not enough ${x.sku} in stock (${units.length}/${x.qty}) for ${d.orderNo}`);
          for (const u of units) {
            await db.query("UPDATE inventory_units SET status = 'dispatched', dispatch_id = $2, order_id = $3, customer_id = $4 WHERE id = $1", [u.id, d.dispatchId, d.orderId, d.cust]);
            await ins('stock_movements', { product_id: x.p.id, qty: -1, reason: 'dispatch', ref_type: 'dispatch', ref_id: d.dispatchId, created_by: WH, created_at: e.ship.date }, null);
          }
        } else if (x.p.sku !== 'SVC-INSTALL') {
          await ins('stock_movements', { product_id: x.p.id, qty: -x.qty, reason: 'dispatch', ref_type: 'dispatch', ref_id: d.dispatchId, created_by: WH, created_at: e.ship.date }, null);
        }
      }
      const vehicle = `GJ${two(between(1, 27))}${pick(['AB', 'AX', 'BT', 'CD', 'DE', 'EF', 'TA', 'TB'])}${between(1000, 9999)}`;
      await db.query("UPDATE dispatches SET status = 'dispatched', vehicle_no = $2, dispatched_at = $3 WHERE id = $1", [d.dispatchId, vehicle, e.ship.date]);
      await act('order', d.orderId, 'dispatched', e.ship, { vehicle }, WH);
      if (d.delivered) {
        await db.query("UPDATE dispatches SET status = 'delivered', delivered_at = $2 WHERE id = $1", [d.dispatchId, e.deliver.date]); // starts every warranty clock
        await act('order', d.orderId, 'delivered', e.deliver, null, WH);
        if (d.assignedDone) {
          if (d.orderStatus === 'completed') {
            const start = new Date(e.installed.date.getTime() - between(4, 9) * 3600e3);
            await db.query("UPDATE installation_jobs SET status = 'completed', scheduled_date = $2, started_at = $3, finished_at = $4, confirmed_kw = $5, notes = $6, signer_name = $7, signature_data = $8, signed_at = $4 WHERE id = $1",
              [d.jobId, e.installed.iso, start, e.installed.date, d.kw, chance(0.2) ? pick(['Inverter mounted on the north wall.', 'Extra earthing pit dug.', 'Cable routed through the staircase duct.']) : null, d.name, 'data:image/png;base64,iVBORw0KGgo=']);
            await ins('job_crew', { job_id: d.jobId, user_id: d.instTech }, null);
            await act('order', d.orderId, 'job_scheduled', e.assigned, { scheduledDate: e.installed.iso }, d.sales);
            await act('order', d.orderId, 'installation_signed_off', e.installed, { confirmedKw: d.kw }, d.instTech);
          } else {
            await db.query("UPDATE installation_jobs SET status = 'scheduled', scheduled_date = $2 WHERE id = $1", [d.jobId, e.installed.iso]);
            await ins('job_crew', { job_id: d.jobId, user_id: d.instTech }, null);
            await act('order', d.orderId, 'job_scheduled', e.assigned, null, d.sales);
          }
        }
      }
    }
    console.log('  dispatches, deliveries and installations loaded');

    // ================================================================ 5. service tickets and warranty claims
    const completed = deals.filter((x) => x.orderStatus === 'completed' && (NOW - x.ev.deliver.date) / 864e5 > 25);
    const used = new Set();
    const unitsOf = async (d, category) => q("SELECT u.id, u.serial_no, u.product_id, to_char(u.warranty_end, 'YYYY-MM-DD') AS warranty_end, to_char(u.warranty_start, 'YYYY-MM-DD') AS warranty_start, u.order_id, u.dispatch_id, u.customer_id FROM inventory_units u JOIN products p ON p.id = u.product_id WHERE u.order_id = $1 AND p.category = $2 ORDER BY u.id", [d.orderId, category]);
    const tickets = [];
    for (let i = 0; i < 46; i++) {
      const d = pick(completed);
      const [subject, code] = pick(FAULTS);
      const lo = Math.round((d.ev.installed.date.getTime() + 10 * 864e5));
      if (lo > NOW - 2 * 864e5) continue;
      const when = new Date(lo + rnd() * (NOW - 2 * 864e5 - lo));
      tickets.push({ d, subject, code, when });
    }
    tickets.sort((a, b) => a.when - b.when);
    for (const t of tickets) {
      const cat = /Battery/.test(t.subject) ? 'battery' : /panel|Panel|junction/i.test(t.subject) ? 'panel' : 'inverter';
      let units = await unitsOf(t.d, cat);
      if (!units.length) units = await unitsOf(t.d, 'inverter');
      if (!units.length) continue;
      const unit = pick(units);
      const age = (NOW - t.when) / 864e5;
      const status = age < 4 ? weighted([['open', 5], ['assigned', 5]]) : age < 12 ? weighted([['assigned', 4], ['resolved', 4], ['closed', 4]]) : weighted([['closed', 14], ['resolved', 1]]);
      const priority = weighted([['normal', 55], ['high', 20], ['low', 15], ['urgent', 10]]);
      const resolvedAt = ['resolved', 'closed'].includes(status) ? new Date(Math.min(NOW, t.when.getTime() + between(1, 6) * 864e5)) : null;
      const no = nextNo('TK', t.when);
      const tid = await ins('tickets', {
        ticket_no: no, customer_id: t.d.cust, unit_id: unit.id, subject: t.subject, description: 'Reported by the customer over the phone.', fault_code: t.code, priority, status, warranty_status: 'in_warranty',
        assigned_to: status === 'open' ? null : pick([...SUP, ...techs]), resolution: resolvedAt ? pick(['Reset the inverter and updated the firmware.', 'Tightened the loose connector and tested.', 'Cleaned the panels and checked the string voltage.', 'Replaced the damaged cover.', 'Re-did the earthing and tested.']) : null,
        resolved_at: resolvedAt, customer_confirmed_at: status === 'closed' ? new Date(resolvedAt.getTime() + between(1, 3) * 864e5) : null, created_by: pick(SUP), created_at: t.when,
      });
      await act('ticket', tid, 'created', t.when, { warranty: 'in_warranty' }, pick(SUP));
      if (resolvedAt) {
        await ins('ticket_lines', { ticket_id: tid, description: 'Technician visit and testing', quantity: 1, unit_price: 500, unit_cost: 0, is_labour: true }, null);
        if (chance(0.5)) {
          const mc4 = products['MC4'];
          await ins('ticket_lines', { ticket_id: tid, product_id: mc4.id, description: mc4.name, quantity: 2, unit_price: mc4.sell, unit_cost: mc4.cost, is_labour: false }, null);
          await ins('stock_movements', { product_id: mc4.id, qty: -2, reason: 'service_part', ref_type: 'ticket', ref_id: tid, created_by: WH, created_at: resolvedAt }, null);
        }
        await act('ticket', tid, 'resolved', resolvedAt, { free: true }, pick(SUP));
      }
    }

    // claims: a mix of every outcome
    const claimPlan = ['replace', 'replace', 'replace', 'replace', 'reject', 'reject', 'repair', 'repair', 'inspected', 'filed'];
    const old = completed.filter((x) => (NOW - x.ev.deliver.date) / 864e5 > 70);
    for (const kind of claimPlan) {
      const d = pick(old);
      const cat = kind === 'replace' || kind === 'repair' ? 'inverter' : pick(['inverter', 'battery']);
      const units = (await unitsOf(d, cat)).filter((u) => !used.has(u.id));
      if (!units.length) continue;
      const unit = units[0]; used.add(unit.id);
      const filed = new Date(Math.max(d.ev.installed.date.getTime() + 40 * 864e5, NOW - between(15, 200) * 864e5));
      if (kind === 'inspected' || kind === 'filed') { /* recent */ }
      const when = kind === 'filed' ? new Date(NOW - 2 * 864e5) : kind === 'inspected' ? new Date(NOW - 6 * 864e5) : filed;
      const claimNo = nextNo('WC', when);
      const SUPPORT = pick(SUP);
      const insp = new Date(when.getTime() + between(1, 4) * 864e5);
      const decided = new Date(insp.getTime() + between(0, 1) * 864e5 + 3600e3);
      const fault = pick(FAULTS);
      const base = {
        claim_no: claimNo, customer_id: d.cust, unit_id: unit.id, issue: fault[0] + '. The customer says it started a week ago.', fault_code: fault[1], covered: true, warranty_end: unit.warranty_end, filed_by: SUPPORT, filed_at: when,
      };
      const common = { technician_id: pick(techs), inspection_date: ymd(insp), inspected_at: insp };
      let row;
      if (kind === 'filed') row = { ...base, status: 'filed' };
      else if (kind === 'inspected') row = { ...base, ...common, status: 'inspected', findings: 'DC input board shows burn marks near the terminal, unit does not start.', cause: 'manufacturing_defect', recommendation: 'replace' };
      else if (kind === 'reject') row = { ...base, ...common, status: 'rejected', findings: 'Water has entered the casing and the board is corroded.', cause: pick(['physical_damage', 'misuse']), recommendation: 'no_fault', decided_by: SUPPORT, decided_at: decided, decision_notes: 'Water damage is not covered by the warranty. Explained to the customer.', closed_at: decided };
      else if (kind === 'repair') {
        const fulfilled = new Date(decided.getTime() + between(1, 3) * 864e5);
        row = { ...base, ...common, status: 'closed', findings: 'Loose display ribbon cable, can be reseated on site.', cause: 'installation_fault', recommendation: 'repair', decided_by: SUPPORT, decided_at: decided, decision_notes: 'Approved as a repair.', remedy: 'repair', repair_cost: between(3, 18) * 100, fulfilled_by: SUPPORT, fulfilled_at: fulfilled, fulfilment_notes: 'Reseated the display cable and tested for an hour.', customer_confirmed_at: new Date(fulfilled.getTime() + 2 * 864e5), closed_at: new Date(fulfilled.getTime() + 2 * 864e5) };
      } else {
        const spare = await q1("SELECT id, serial_no FROM inventory_units WHERE product_id = $1 AND status = 'in_stock' AND created_at < $2 ORDER BY id LIMIT 1", [unit.product_id, when]);
        if (!spare) continue;
        const fulfilled = new Date(decided.getTime() + between(1, 4) * 864e5);
        const rma = pick(['credited', 'credited', 'sent', 'pending']);
        await db.query("UPDATE inventory_units SET status = 'faulty' WHERE id = $1", [unit.id]);
        await db.query("UPDATE inventory_units SET status = 'delivered', customer_id = $2, order_id = $3, dispatch_id = $4, warranty_start = $5::date, warranty_end = $6::date WHERE id = $1", [spare.id, unit.customer_id, unit.order_id, unit.dispatch_id, ymd(fulfilled), unit.warranty_end]);
        await ins('stock_movements', { product_id: unit.product_id, qty: -1, reason: 'service_part', ref_type: 'claim', ref_id: 0, created_by: WH, created_at: fulfilled }, null);
        row = { ...base, ...common, status: 'closed', findings: 'DC input board is burnt and the unit cannot be repaired on site.', cause: 'manufacturing_defect', recommendation: 'replace', decided_by: SUPPORT, decided_at: decided, decision_notes: 'Genuine factory defect, replace the unit.', remedy: 'replace', replacement_unit_id: spare.id, fulfilled_by: SUPPORT, fulfilled_at: fulfilled, fulfilment_notes: 'Swapped on site.', rma, rma_reference: rma === 'pending' ? null : `RMA-${between(1000, 9999)}`, supplier_credit: rma === 'credited' ? between(60, 280) * 100 : null, customer_confirmed_at: new Date(fulfilled.getTime() + 2 * 864e5), closed_at: new Date(fulfilled.getTime() + 2 * 864e5) };
      }
      const cid = await ins('warranty_claims', row);
      if (kind === 'replace') await db.query("UPDATE stock_movements SET ref_id = $1 WHERE ref_type = 'claim' AND ref_id = 0", [cid]);
      await act('claim', cid, 'filed', when, { covered: true }, SUPPORT);
      if (row.technician_id) { await act('claim', cid, 'inspection_booked', when, null, SUPPORT); await act('claim', cid, 'inspected', insp, null, row.technician_id); }
      if (row.status === 'rejected') await act('claim', cid, 'rejected', decided, null, SUPPORT);
      if (['closed'].includes(row.status)) { await act('claim', cid, 'approved', decided, null, SUPPORT); await act('claim', cid, kind === 'replace' ? 'replaced' : 'repaired', row.fulfilled_at, null, SUPPORT); await act('claim', cid, 'closed', row.closed_at, null, SUPPORT); }
    }
    console.log('  tickets and warranty claims loaded');

    // numbering continues after the last number of the current year
    const seqs = { Q: 'quote_seq', SO: 'order_seq', INV: 'invoice_seq', PO: 'po_seq', TK: 'ticket_seq', WC: 'claim_seq' };
    for (const [prefix, seq] of Object.entries(seqs)) await db.query(`SELECT setval('${seq}', GREATEST($1::int, 1), $2)`, [counters[`${prefix}2026`] || 1, !!counters[`${prefix}2026`]]);

    // ================================================================ 6. safety checks before we commit
    const bad = await q(`SELECT s.sku, s.on_hand FROM v_stock s WHERE s.on_hand < 0
                         UNION ALL SELECT s.sku, s.on_hand FROM v_stock s WHERE s.tracked_serial AND s.on_hand <> (SELECT count(*)::int FROM inventory_units u WHERE u.product_id = s.product_id AND u.status = 'in_stock')`);
    if (bad.length) throw new Error('Stock does not add up: ' + JSON.stringify(bad));
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }

  const n = async (t) => (await pool.query(`select count(*)::int n from ${t}`)).rows[0].n;
  const total = {};
  for (const t of ['enquiries', 'surveys', 'quotes', 'quote_items', 'customers', 'orders', 'invoices', 'payments', 'subsidy_applications', 'purchase_orders', 'inventory_units', 'stock_movements', 'dispatches', 'installation_jobs', 'tickets', 'warranty_claims', 'activity_log']) total[t] = await n(t);
  console.log('\nOne year of data loaded:');
  console.log(JSON.stringify(total));
  console.log('Staff untouched:', (await pool.query('select count(*)::int n from users')).rows[0].n, 'account(s)');
}

main().then(() => pool.end()).catch((e) => { console.error('\nFAILED, nothing was saved:', e.message); pool.end(); process.exit(1); });
