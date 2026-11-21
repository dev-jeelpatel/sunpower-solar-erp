// End-to-end check of the warranty claim process.
// It writes test data, so run it on a throwaway database only:
//   API_URL=http://localhost:4100/api DATABASE_URL=postgres://.../scratch node scripts/e2e-claims.cjs --confirm
require('dotenv').config();
const assert = require('node:assert/strict');
const { Pool } = require('pg');

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to run: this test writes data into the database the API uses.');
  console.error('If it is a throwaway database, add --confirm');
  process.exit(1);
}
const BASE = process.env.API_URL || 'http://localhost:4000/api';
const PASSWORD = 'Sunpower@123';
const tokens = {};
let passed = 0;

async function call(method, url, { token, body } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, data };
}
const ok = async (label, p, status = 200) => {
  const r = await p;
  assert.equal(r.status, status, `${label}: expected ${status}, got ${r.status} ${JSON.stringify(r.data)}`);
  passed++; console.log('  ✓', label);
  return r.data;
};
const fails = async (label, p, status, includes) => {
  const r = await p;
  assert.equal(r.status, status, `${label}: expected ${status}, got ${r.status} ${JSON.stringify(r.data)}`);
  if (includes) assert.ok(JSON.stringify(r.data).toLowerCase().includes(includes.toLowerCase()), `${label}: should mention "${includes}": ${JSON.stringify(r.data)}`);
  passed++; console.log('  ✓', label);
  return r.data;
};
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = async (s, a) => (await pool.query(s, a)).rows;
  for (const n of ['admin', 'support', 'tech1', 'tech2', 'warehouse', 'director', 'sales']) {
    tokens[n] = (await ok(`login ${n}`, call('POST', '/auth/login', { body: { email: `${n}@sunpower.test`, password: PASSWORD } }))).token;
  }
  const users = Object.fromEntries((await sql("select id, email from users")).map((u) => [u.email.split('@')[0], u.id]));

  // pick delivered inverters that are still in warranty and have a spare of the same model in stock
  const units = await sql(`select u.serial_no, u.id, u.product_id, u.warranty_end from inventory_units u join products p on p.id = u.product_id
                           where u.status = 'delivered' and p.category = 'inverter' and u.warranty_end >= current_date
                             and exists (select 1 from inventory_units s where s.product_id = u.product_id and s.status = 'in_stock') order by u.id limit 3`);
  assert.ok(units.length >= 3, 'need three delivered inverters with spares');
  const [a, b, c] = units;
  const spare = (await sql("select serial_no from inventory_units where product_id = $1 and status = 'in_stock' order by id limit 1", [a.product_id]))[0].serial_no;
  const otherModel = (await sql("select serial_no from inventory_units where product_id <> $1 and status = 'in_stock' limit 1", [a.product_id]))[0].serial_no;

  console.log('Filing');
  await fails('serial is required', call('POST', '/claims', { token: tokens.support, body: { issue: 'Inverter will not switch on at all' } }), 400);
  await fails('unknown serial', call('POST', '/claims', { token: tokens.support, body: { serial: 'NOPE-999999', issue: 'Inverter will not switch on' } }), 422, 'No unit');
  await fails('short description', call('POST', '/claims', { token: tokens.support, body: { serial: a.serial_no, issue: 'broken' } }), 400);
  await fails('technician cannot file', call('POST', '/claims', { token: tokens.tech1, body: { serial: a.serial_no, issue: 'Inverter will not switch on at all' } }), 403);
  await fails('director is read-only', call('POST', '/claims', { token: tokens.director, body: { serial: a.serial_no, issue: 'Inverter will not switch on at all' } }), 403);
  await fails('a unit still in stock cannot be claimed', call('POST', '/claims', { token: tokens.support, body: { serial: spare, issue: 'Inverter will not switch on at all' } }), 422, 'delivered');
  const claim = await ok('file a claim', call('POST', '/claims', { token: tokens.support, body: { serial: a.serial_no, issue: 'Inverter shows fault E04 and gives no power', faultCode: 'e04' } }), 201);
  assert.equal(claim.status, 'filed');
  assert.equal(claim.covered, true, 'in warranty');
  assert.match(claim.claim_no, /^WC-\d{4}-\d{4}$/);
  await fails('only one live claim per unit', call('POST', '/claims', { token: tokens.support, body: { serial: a.serial_no, issue: 'Filing the same problem a second time' } }), 409, claim.claim_no);

  console.log('Inspection');
  await fails('cannot approve before inspection', call('POST', `/claims/${claim.id}/decision`, { token: tokens.support, body: { decision: 'approve', remedy: 'replace', notes: 'Approved without looking' } }), 422, 'inspection report');
  await fails('visit date in the past', call('POST', `/claims/${claim.id}/assign`, { token: tokens.support, body: { technicianId: users.tech1, visitDate: '2020-01-01' } }), 400, 'past');
  await fails('technician cannot assign', call('POST', `/claims/${claim.id}/assign`, { token: tokens.tech1, body: { technicianId: users.tech1, visitDate: day(3) } }), 403);
  await ok('book the technician', call('POST', `/claims/${claim.id}/assign`, { token: tokens.support, body: { technicianId: users.tech1, visitDate: day(3) } }));
  const avail = await ok('availability counts the inspection', call('GET', `/availability?date=${day(3)}`, { token: tokens.support }));
  assert.ok(avail.find((t) => t.id === users.tech1).note, 'tech1 shows a visit that day');
  await fails('another technician cannot report', call('POST', `/claims/${claim.id}/inspection`, { token: tokens.tech2, body: { findings: 'Looked at it for a while', cause: 'manufacturing_defect', recommendation: 'replace' } }), 403);
  await fails('findings too short', call('POST', `/claims/${claim.id}/inspection`, { token: tokens.tech1, body: { findings: 'bad', cause: 'manufacturing_defect', recommendation: 'replace' } }), 400);
  await fails('cause must be chosen', call('POST', `/claims/${claim.id}/inspection`, { token: tokens.tech1, body: { findings: 'Board burnt near the DC input', recommendation: 'replace' } }), 400);
  const mine = await ok('technician sees only own claims', call('GET', '/claims', { token: tokens.tech1 }));
  assert.ok(mine.items.every((x) => x.technician_id === users.tech1));
  const other = await ok('other technician list is empty of it', call('GET', '/claims', { token: tokens.tech2 }));
  assert.ok(!other.items.find((x) => x.id === claim.id));
  await fails('other technician cannot open it', call('GET', `/claims/${claim.id}`, { token: tokens.tech2 }), 403);
  const insp = await ok('submit the inspection', call('POST', `/claims/${claim.id}/inspection`, { token: tokens.tech1, body: { findings: 'DC input board is burnt, unit cannot be repaired on site', cause: 'manufacturing_defect', recommendation: 'replace' } }));
  assert.equal(insp.status, 'inspected');

  console.log('Decision');
  await fails('approval needs a remedy', call('POST', `/claims/${claim.id}/decision`, { token: tokens.support, body: { decision: 'approve', notes: 'Looks like a genuine factory defect' } }), 400, 'repair or replacement');
  const approved = await ok('approve as replacement', call('POST', `/claims/${claim.id}/decision`, { token: tokens.support, body: { decision: 'approve', remedy: 'replace', notes: 'Genuine factory defect, replace the unit' } }));
  assert.equal(approved.status, 'approved');

  console.log('Fulfilment');
  const before = (await sql('select on_hand from v_stock where product_id = $1', [a.product_id]))[0].on_hand;
  await fails('replacement serial is required', call('POST', `/claims/${claim.id}/fulfil`, { token: tokens.warehouse, body: {} }), 422, 'replacement unit');
  await fails('replacement must be the same model', call('POST', `/claims/${claim.id}/fulfil`, { token: tokens.warehouse, body: { replacementSerial: otherModel } }), 422, 'same product model');
  await fails('replacement must be in stock', call('POST', `/claims/${claim.id}/fulfil`, { token: tokens.warehouse, body: { replacementSerial: b.serial_no } }), 422, 'not in stock');
  const done = await ok('hand over the replacement', call('POST', `/claims/${claim.id}/fulfil`, { token: tokens.warehouse, body: { replacementSerial: spare, notes: 'Swapped on site' } }));
  assert.equal(done.status, 'fulfilled');
  assert.equal(done.rma, 'pending');
  const oldUnit = (await sql('select status from inventory_units where id = $1', [a.id]))[0];
  const newUnit = (await sql('select status, customer_id, warranty_end from inventory_units where serial_no = $1', [spare]))[0];
  assert.equal(oldUnit.status, 'faulty', 'old unit marked faulty');
  assert.equal(newUnit.status, 'delivered', 'new unit is with the customer');
  assert.equal(String(newUnit.warranty_end), String(a.warranty_end), 'the replacement keeps the remaining warranty');
  const after = (await sql('select on_hand from v_stock where product_id = $1', [a.product_id]))[0].on_hand;
  assert.equal(after, before - 1, 'stock went down by one');
  passed += 3; console.log('  ✓ old unit faulty, replacement keeps warranty, stock reduced');
  await fails('the faulty unit cannot be claimed again', call('POST', '/claims', { token: tokens.support, body: { serial: a.serial_no, issue: 'Trying to claim the replaced unit' } }), 422, 'replaced');

  console.log('Supplier return');
  await fails('credit before sending', call('POST', `/claims/${claim.id}/supplier-return`, { token: tokens.warehouse, body: { status: 'credited', credit: 100 } }), 422, 'sent');
  await fails('sent needs a reference', call('POST', `/claims/${claim.id}/supplier-return`, { token: tokens.warehouse, body: { status: 'sent' } }), 422, 'reference');
  await ok('mark sent to supplier', call('POST', `/claims/${claim.id}/supplier-return`, { token: tokens.warehouse, body: { status: 'sent', reference: 'RMA-1001' } }));
  await fails('negative credit', call('POST', `/claims/${claim.id}/supplier-return`, { token: tokens.warehouse, body: { status: 'credited', credit: -5 } }), 400);
  const credited = await ok('credit received', call('POST', `/claims/${claim.id}/supplier-return`, { token: tokens.warehouse, body: { status: 'credited', credit: 9000 } }));
  assert.equal(credited.rma, 'credited');

  console.log('Closing');
  const closed = await ok('customer confirms and the claim closes', call('POST', `/claims/${claim.id}/close`, { token: tokens.support }));
  assert.equal(closed.status, 'closed');
  assert.ok(closed.timeline.length >= 8, 'timeline recorded every step');
  await fails('a closed claim cannot be closed again', call('POST', `/claims/${claim.id}/close`, { token: tokens.support }), 422);

  console.log('Out of warranty, rejection and withdrawal');
  await sql('update inventory_units set warranty_end = current_date - 20 where id = $1', [b.id]);
  const late = await ok('file for an expired warranty', call('POST', '/claims', { token: tokens.support, body: { serial: b.serial_no, issue: 'Inverter stopped working after the monsoon' } }), 201);
  assert.equal(late.covered, false, 'flagged as out of warranty');
  await ok('book inspection', call('POST', `/claims/${late.id}/assign`, { token: tokens.support, body: { technicianId: users.tech2, visitDate: day(4) } }));
  await ok('inspect', call('POST', `/claims/${late.id}/inspection`, { token: tokens.tech2, body: { findings: 'Water ingress inside the casing, rust on the board', cause: 'physical_damage', recommendation: 'no_fault' } }));
  await fails('approval needs goodwill when expired', call('POST', `/claims/${late.id}/decision`, { token: tokens.support, body: { decision: 'approve', remedy: 'repair', notes: 'Please approve this one' } }), 422, 'goodwill');
  await fails('only admin can approve goodwill', call('POST', `/claims/${late.id}/decision`, { token: tokens.support, body: { decision: 'approve', remedy: 'repair', notes: 'Customer is a good friend of ours', goodwill: true } }), 403, 'admin');
  await fails('rejection needs a real reason', call('POST', `/claims/${late.id}/decision`, { token: tokens.support, body: { decision: 'reject', notes: 'no' } }), 400);
  const rejected = await ok('reject with a reason', call('POST', `/claims/${late.id}/decision`, { token: tokens.support, body: { decision: 'reject', notes: 'Warranty ended 20 days ago and the casing shows water damage' } }));
  assert.equal(rejected.status, 'rejected');
  await fails('a rejected claim cannot be fulfilled', call('POST', `/claims/${late.id}/fulfil`, { token: tokens.warehouse, body: { notes: 'x' } }), 422);
  const again = await ok('the unit can be claimed again after a rejection', call('POST', '/claims', { token: tokens.support, body: { serial: b.serial_no, issue: 'Second attempt after the rejection' } }), 201);
  await fails('withdraw needs a reason', call('POST', `/claims/${again.id}/withdraw`, { token: tokens.support, body: {} }), 400);
  const wd = await ok('customer withdraws', call('POST', `/claims/${again.id}/withdraw`, { token: tokens.support, body: { reason: 'Customer fixed the wiring himself' } }));
  assert.equal(wd.status, 'withdrawn');

  console.log('Goodwill and repair');
  await sql('update inventory_units set warranty_end = current_date - 5 where id = $1', [c.id]);
  const gw = await ok('file another expired claim', call('POST', '/claims', { token: tokens.support, body: { serial: c.serial_no, issue: 'Display flickers and then switches off' } }), 201);
  await ok('book', call('POST', `/claims/${gw.id}/assign`, { token: tokens.support, body: { technicianId: users.tech1, visitDate: day(5) } }));
  await ok('inspect', call('POST', `/claims/${gw.id}/inspection`, { token: tokens.tech1, body: { findings: 'Loose display ribbon cable, can be reseated on site', cause: 'installation_fault', recommendation: 'repair' } }));
  const g = await ok('admin approves as goodwill', call('POST', `/claims/${gw.id}/decision`, { token: tokens.admin, body: { decision: 'approve', remedy: 'repair', notes: 'Only five days out of warranty, goodwill', goodwill: true } }));
  assert.equal(g.goodwill, true);
  await fails('a repair needs a note', call('POST', `/claims/${gw.id}/fulfil`, { token: tokens.support, body: { repairCost: 300 } }), 422, 'repair');
  await fails('a repair does not need a replacement', call('POST', `/claims/${gw.id}/fulfil`, { token: tokens.support, body: { replacementSerial: spare, notes: 'Reseated' } }), 422, 'repair');
  const rep = await ok('record the repair', call('POST', `/claims/${gw.id}/fulfil`, { token: tokens.support, body: { repairCost: 300, notes: 'Reseated the display cable' } }));
  assert.equal(rep.rma, 'none');
  assert.equal(Number(rep.repair_cost), 300);

  const stats = await ok('claim numbers', call('GET', '/claims/stats', { token: tokens.support }));
  assert.ok(stats.to_close >= 1 && stats.credit >= 9000);

  await pool.end();
  console.log(`\nAll ${passed} claim checks passed.`);
})().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
