// End-to-end smoke test of the whole business flow against a running API + seeded DB.
// Usage: (server running)  node scripts/e2e.js   [API_URL=http://localhost:4000]
const assert = require('node:assert/strict');
const BASE = process.env.API_URL || 'http://localhost:4000/api';
const PASSWORD = 'Sunpower@123';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let passed = 0;
const tokens = {};
async function call(method, url, { token, body, form } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}
const ok = async (label, p, status = 200) => {
  const r = await p;
  assert.equal(r.status, status, `${label}: expected ${status}, got ${r.status} ${JSON.stringify(r.data)}`);
  passed++;
  console.log('  ✓', label);
  return r.data;
};
const fails = async (label, p, status, includes) => {
  const r = await p;
  assert.equal(r.status, status, `${label}: expected ${status}, got ${r.status} ${JSON.stringify(r.data)}`);
  if (includes) assert.ok(JSON.stringify(r.data).includes(includes), `${label}: response should mention "${includes}": ${JSON.stringify(r.data)}`);
  passed++;
  console.log('  ✓', label);
  return r.data;
};
async function login(name) {
  const d = await ok(`login ${name}`, call('POST', '/auth/login', { body: { email: `${name}@sunpower.test`, password: PASSWORD } }));
  tokens[name] = d.token;
  return d.user;
}

(async () => {
  console.log('Validation & auth');
  await fails('invalid email is rejected with a field message', call('POST', '/public/enquiries', { body: { name: 'Test User', phone: '9876543210', email: 'not-an-email', address: '10 Test Street, City', requestedKw: 3, systemType: 'on_grid' } }), 400, 'valid email');
  await fails('invalid phone is rejected', call('POST', '/public/enquiries', { body: { name: 'Test User', phone: '12345', address: '10 Test Street, City', requestedKw: 3, systemType: 'on_grid' } }), 400, '10-digit');
  await fails('size out of range is rejected', call('POST', '/public/enquiries', { body: { name: 'Test User', phone: '9876543210', address: '10 Test Street, City', requestedKw: 9, systemType: 'on_grid' } }), 400, 'Maximum');
  await fails('wrong password', call('POST', '/auth/login', { body: { email: 'sales@sunpower.test', password: 'nope' } }), 401, 'Incorrect');
  await fails('protected route needs token', call('GET', '/enquiries'), 401);
  for (const n of ['sales', 'tech1', 'warehouse', 'support', 'director', 'admin']) await login(n);
  await fails('technician cannot create quotes', call('POST', '/quotes', { token: tokens.tech1, body: { enquiryId: 1, packageId: 1 } }), 403);

  console.log('Enquiry -> survey -> quote');
  const stamp = String(Date.now()).slice(-6);
  const enq = await ok('public enquiry accepted', call('POST', '/public/enquiries', { body: { name: 'E2E Customer', phone: `98${stamp}12`.slice(0, 10).padEnd(10, '1'), email: `e2e${stamp}@example.com`, address: '21 Sunrise Society, Ahmedabad', city: 'Ahmedabad', requestedKw: 3, systemType: 'on_grid', subsidyRequired: true } }), 201);
  const enquiryId = enq.id;
  await fails('survey blocked before qualification', call('POST', '/surveys', { token: tokens.sales, body: { enquiryId, technicianId: 4, scheduledDate: '2099-01-01' } }), 422);
  await fails('cannot qualify without checklist', call('POST', `/enquiries/${enquiryId}/qualify`, { token: tokens.sales, body: { decision: 'qualified' } }), 422, 'checklist');
  await ok('qualify', call('POST', `/enquiries/${enquiryId}/qualify`, { token: tokens.sales, body: { decision: 'qualified', shadowFreeSqft: 450, monthlyBill: 6500, gridSuitable: true, notes: 'Good roof' } }));
  const techs = await ok('list technicians', call('GET', '/users?role=technician', { token: tokens.sales }));
  const tech1 = techs.find((t) => t.email === 'tech1@sunpower.test');
  const packages = await ok('list packages', call('GET', '/catalog/packages', { token: tokens.sales }));
  const pkg = packages.find((p) => p.kind === 'on_grid' && Number(p.capacity_kw) === 3);
  assert.ok(pkg.items.length >= 10, 'BOM should list every part');
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const survey = await ok('schedule survey', call('POST', '/surveys', { token: tokens.sales, body: { enquiryId, technicianId: tech1.id, scheduledDate: tomorrow } }), 201);
  await fails('quote blocked before survey approved', call('POST', '/quotes', { token: tokens.sales, body: { enquiryId, packageId: pkg.id } }), 422, 'survey');
  await ok('technician submits survey', call('POST', `/surveys/${survey.id}/complete`, { token: tokens.tech1, body: { roofDirection: 'S', roofTiltDeg: 18, cableDistanceM: 22, usableAreaSqft: 400 } }));
  await ok('sales approves survey', call('POST', `/surveys/${survey.id}/review`, { token: tokens.sales, body: { decision: 'approve' } }));
  const quote = await ok('quote created from package template', call('POST', '/quotes', { token: tokens.sales, body: { enquiryId, packageId: pkg.id, discount: 2000 } }), 201);
  assert.equal(quote.items.length, pkg.items.length);
  await ok('send quote', call('POST', `/quotes/${quote.id}/send`, { token: tokens.sales }));

  console.log('Order -> payment -> dispatch');
  const order = await ok('accept quote creates order', call('POST', `/quotes/${quote.id}/accept`, { token: tokens.sales }), 201);
  let o = await ok('order detail', call('GET', `/orders/${order.id}`, { token: tokens.sales }));
  assert.equal(o.status, 'pending_payment');
  assert.ok(o.subsidy, 'subsidy file created');
  await fails('overpayment rejected', call('POST', `/invoices/${o.invoice.id}/payments`, { token: tokens.sales, body: { amount: o.total + 1, method: 'upi' } }), 422, 'exceeds');
  await fails('invalid amount rejected', call('POST', `/invoices/${o.invoice.id}/payments`, { token: tokens.sales, body: { amount: -5, method: 'upi' } }), 400);
  await ok('small payment keeps order pending', call('POST', `/invoices/${o.invoice.id}/payments`, { token: tokens.sales, body: { amount: 1000, method: 'cash' } }), 201);
  o = await ok('order still pending', call('GET', `/orders/${order.id}`, { token: tokens.sales }));
  assert.equal(o.status, 'pending_payment');
  const pay = await ok('advance confirms order', call('POST', `/invoices/${o.invoice.id}/payments`, { token: tokens.sales, body: { amount: o.advanceRequired, method: 'upi', reference: 'UPI123' } }), 201);
  assert.equal(pay.orderConfirmed, true);
  o = await ok('confirmed order', call('GET', `/orders/${order.id}`, { token: tokens.sales }));
  assert.equal(o.status, 'confirmed');
  assert.ok(o.dispatch, 'warehouse dispatch created');
  assert.equal(o.job.status, 'scheduled', 'job auto-scheduled');

  const disp = await ok('warehouse sees pick list', call('GET', `/dispatches/${o.dispatch.id}`, { token: tokens.warehouse }));
  await fails('cannot dispatch before scanning', call('POST', `/dispatches/${disp.id}/dispatch`, { token: tokens.warehouse, body: { vehicleNo: 'GJ05AB1234' } }), 422, 'Scan every serial');
  const units = await ok('serial units in stock', call('GET', '/inventory/units?status=in_stock&limit=100', { token: tokens.warehouse }));
  const scanned = [];
  for (const line of disp.items.filter((l) => l.tracked_serial)) {
    const pool = units.items.filter((u) => u.product_id === line.product_id && !scanned.includes(u.serial_no)).slice(0, line.required);
    assert.equal(pool.length, line.required, `enough stock for ${line.sku}`);
    for (const u of pool) { await ok(`scan ${u.serial_no}`, call('POST', `/dispatches/${disp.id}/scan`, { token: tokens.warehouse, body: { serial: u.serial_no } })); scanned.push(u.serial_no); }
  }
  await fails('same serial cannot be scanned twice', call('POST', `/dispatches/${disp.id}/scan`, { token: tokens.warehouse, body: { serial: scanned[0] } }), 422);
  await fails('invalid vehicle number rejected', call('POST', `/dispatches/${disp.id}/dispatch`, { token: tokens.warehouse, body: { vehicleNo: '??' } }), 400);
  await ok('truck dispatched', call('POST', `/dispatches/${disp.id}/dispatch`, { token: tokens.warehouse, body: { vehicleNo: 'GJ05AB1234' } }));
  await ok('delivery confirmed', call('POST', `/dispatches/${disp.id}/deliver`, { token: tokens.warehouse }));
  const invSerial = scanned.find((s) => s.startsWith('INV'));
  const lookup = await ok('warranty lookup by serial', call('GET', `/inventory/units/lookup/${invSerial}`, { token: tokens.support }));
  assert.equal(lookup.warranty_state, 'in_warranty');
  assert.ok(lookup.warranty_end, 'warranty clock started automatically');
  const panelSerial = scanned.find((s) => s.startsWith('PNL'));
  const pl = await ok('panel lookup', call('GET', `/inventory/units/lookup/${panelSerial}`, { token: tokens.support }));
  assert.ok(new Date(pl.warranty_end).getFullYear() - new Date().getFullYear() >= 19, 'panel warranty ~20 years');

  console.log('Installation sign-off');
  const jobs = await ok('technician sees own jobs', call('GET', '/jobs', { token: tokens.tech1 }));
  let job = jobs.find((j) => j.order_no === o.order_no);
  if (!job) { // auto-assign may have chosen another technician: reassign to tech1
    await ok('reassign crew', call('POST', `/orders/${order.id}/schedule`, { token: tokens.sales, body: { technicianIds: [tech1.id], scheduledDate: tomorrow } }));
    job = (await ok('jobs again', call('GET', '/jobs', { token: tokens.tech1 }))).find((j) => j.order_no === o.order_no);
  }
  const now = new Date();
  const body = { startedAt: new Date(now - 6 * 3600e3).toISOString(), finishedAt: new Date(now - 60e3).toISOString(), confirmedKw: 3, signerName: 'E2E Customer', signature: PNG };
  await fails('completion needs a photo', call('POST', `/jobs/${job.id}/complete`, { token: tokens.tech1, body }), 422, 'photo');
  const form = new FormData();
  form.append('photos', new Blob([Buffer.from(PNG.split(',')[1], 'base64')], { type: 'image/png' }), 'roof.png');
  await ok('photo uploaded', call('POST', `/jobs/${job.id}/photos`, { token: tokens.tech1, form }), 201);
  await fails('finish before start rejected', call('POST', `/jobs/${job.id}/complete`, { token: tokens.tech1, body: { ...body, finishedAt: new Date(now - 7 * 3600e3).toISOString() } }), 422, 'after the start');
  await fails('signature required', call('POST', `/jobs/${job.id}/complete`, { token: tokens.tech1, body: { ...body, signature: '' } }), 400, 'signature');
  await ok('job signed off', call('POST', `/jobs/${job.id}/complete`, { token: tokens.tech1, body }));
  o = await ok('order completed', call('GET', `/orders/${order.id}`, { token: tokens.sales }));
  assert.equal(o.status, 'completed');

  console.log('After-sales ticket (in warranty -> free, out of warranty -> billed)');
  const t1 = await ok('ticket from serial', call('POST', '/tickets', { token: tokens.support, body: { serial: invSerial, subject: 'Inverter fault code E04, zero power', faultCode: 'e04', priority: 'urgent' } }), 201);
  assert.equal(t1.warranty_status, 'in_warranty');
  await ok('resolve free of charge', call('POST', `/tickets/${t1.id}/resolve`, { token: tokens.support, body: { resolution: 'Firmware reset and tested' } }));
  const t1r = await ok('ticket detail', call('GET', `/tickets/${t1.id}`, { token: tokens.support }));
  assert.equal(t1r.invoice, null, 'no invoice for in-warranty repair');
  await ok('customer confirms -> closed', call('POST', `/tickets/${t1.id}/confirm`, { token: tokens.support }));
  // the demo data is only a few months old, so age one delivered unit by hand to get an expired warranty
  const agedSerial = scanned.find((s) => s.startsWith('MC'));
  {
    require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query("UPDATE inventory_units SET warranty_start = current_date - 800, warranty_end = current_date - 30 WHERE serial_no = $1", [agedSerial]);
    await pool.end();
  }
  const old = (await ok('serial search', call('GET', `/search?q=${agedSerial}`, { token: tokens.support }))).units.find((u) => u.warranty_state === 'expired');
  assert.ok(old, 'an aged unit shows as expired');
  const t2 = await ok('ticket on expired unit', call('POST', '/tickets', { token: tokens.support, body: { serial: old.serial_no, subject: 'Battery not holding charge' } }), 201);
  assert.equal(t2.warranty_status, 'out_of_warranty');
  await fails('cannot resolve out-of-warranty without billable lines', call('POST', `/tickets/${t2.id}/resolve`, { token: tokens.support, body: { resolution: 'Battery replaced' } }), 422, 'warranty');
  await ok('add labour line', call('POST', `/tickets/${t2.id}/lines`, { token: tokens.support, body: { description: 'Service visit labour', quantity: 1, unitPrice: 800, isLabour: true } }), 201);
  const t2r = await ok('resolve billed', call('POST', `/tickets/${t2.id}/resolve`, { token: tokens.support, body: { resolution: 'Terminals cleaned, battery tested' } }));
  assert.ok(t2r.invoice && t2r.invoice.total > 800, 'invoice auto-generated');

  console.log('Director reports');
  const dash = await ok('dashboard', call('GET', '/reports/dashboard?period=month', { token: tokens.director }));
  assert.ok(dash.kpi.collections > 0);
  const prof = await ok('profitability', call('GET', '/reports/profitability', { token: tokens.director }));
  assert.ok(prof.items.some((r) => r.order_no === o.order_no && r.labour_cost > 0), 'labour cost included');
  await ok('unfinished list', call('GET', '/reports/unfinished', { token: tokens.director }));
  await ok('csv export', call('GET', '/reports/export/profitability.csv', { token: tokens.director }));
  await fails('sales cannot see profitability', call('GET', '/reports/profitability', { token: tokens.sales }), 403);
  await fails('director is read-only', call('POST', '/quotes', { token: tokens.director, body: { enquiryId, packageId: pkg.id } }), 403);

  console.log(`\nAll ${passed} checks passed.`);
})().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
