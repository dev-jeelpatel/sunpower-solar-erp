// @ts-nocheck
// Loads only the product catalogue and the standard packages (no customers, no stock, no staff changes).
//   npm run db:catalog
import 'dotenv/config';
import { Pool } from 'pg';
import { env } from '../../src/config/env';

const pool = new Pool({ connectionString: env.databaseUrl });

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


async function main() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM products');
  if (rows[0].n > 0) throw new Error('Products already exist. Nothing was changed.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const P = {};
    for (const [sku, name, cat, tracked, war, cost, sell, reorder] of PRODUCTS) {
      const r = await client.query('INSERT INTO products (sku,name,category,tracked_serial,warranty_months,cost_price,sell_price,reorder_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [sku, name, cat, tracked, war, cost, sell, reorder]);
      P[sku] = r.rows[0].id;
    }
    const mk = async (name, kind, kw, desc, items) => {
      const r = await client.query('INSERT INTO packages (name,kind,capacity_kw,description) VALUES ($1,$2,$3,$4) RETURNING id', [name, kind, kw, desc]);
      for (const [sku, n] of items) await client.query('INSERT INTO package_items (package_id,product_id,quantity) VALUES ($1,$2,$3)', [r.rows[0].id, P[sku], n]);
    };
    await mk('Solar Panel Set (Hardware)', 'hardware', null, 'Solar panels, connectors and wires', [['PNL-540', 4], ['MC4', 4], ['CBL-DC', 20]]);
    for (const kw of [1, 2, 3, 4, 5]) {
      await mk(`On-Grid System ${kw} kW`, 'on_grid', kw, 'Inverter, wiring boxes, charge controller, panels, earthing and stands', bom('on_grid', kw));
      await mk(`Off-Grid System ${kw} kW`, 'off_grid', kw, 'Everything in On-Grid plus battery bank', bom('off_grid', kw));
    }
    await mk('Installation (Service)', 'service', null, 'Fitting and testing by our crew', [['SVC-INSTALL', 1]]);
    await client.query('COMMIT');
    console.log(`Catalogue loaded: ${PRODUCTS.length} products and 12 packages.`);
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
main().then(() => pool.end()).catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
