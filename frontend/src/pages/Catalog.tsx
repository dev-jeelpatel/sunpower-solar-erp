import { useState } from 'react';
import { get, post, put } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Field, Modal, PageHead, Tabs, label, money, useAction, useAsync, useForm } from '../components/ui';
import { Chips, Kpi, KpiRow, Meter, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
import { validate, required, minLen } from '../validators';

const CATS = ['panel', 'inverter', 'battery', 'charge_controller', 'wiring_box', 'switch', 'earthing', 'stand', 'cable', 'connector', 'service'];

function ProductForm({ p, onClose, onDone }) {
  const f = useForm({ sku: p?.sku || '', name: p?.name || '', category: p?.category || 'panel', trackedSerial: p?.tracked_serial || false, warrantyMonths: p?.warranty_months ?? 0 /* not in v_stock */, costPrice: p?.cost_price ?? '', sellPrice: p?.sell_price ?? '', reorderLevel: p?.reorder_level ?? 0 });
  const { run, busy, error } = useAction(f.setErrors);
  const v = f.values;
  const submit = async () => {
    const errs = validate(v, { sku: [required('SKU')], name: [required('Name'), minLen(3, 'Name')], costPrice: [required('Cost price')], sellPrice: [required('Selling price')] });
    if (!errs.sellPrice && Number(v.sellPrice) < Number(v.costPrice)) errs.sellPrice = 'Selling price is below cost price';
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = { ...v, warrantyMonths: Number(v.warrantyMonths), costPrice: Number(v.costPrice), sellPrice: Number(v.sellPrice), reorderLevel: Number(v.reorderLevel) };
    if (await run(() => (p ? put(`/catalog/products/${p.product_id}`, body) : post('/catalog/products', body)), 'Product saved')) onDone();
  };
  return (
    <Modal title={p ? 'Edit product' : 'New product'} onClose={onClose} wide footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Save</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="SKU" error={f.errors.sku}><input {...f.bind('sku')} style={{ textTransform: 'uppercase' }} /></Field>
        <Field label="Category" error={f.errors.category}><select {...f.bind('category')}>{CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></Field>
        <Field label="Name" className="full" error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Cost price (₹)" error={f.errors.costPrice}><input type="number" min="0" {...f.bind('costPrice')} /></Field>
        <Field label="Selling price (₹)" error={f.errors.sellPrice}><input type="number" min="0" {...f.bind('sellPrice')} /></Field>
        <Field label="Warranty (months)" hint="Starts automatically at delivery" error={f.errors.warrantyMonths}><input type="number" min="0" {...f.bind('warrantyMonths')} /></Field>
        <Field label="Reorder level" error={f.errors.reorderLevel}><input type="number" min="0" {...f.bind('reorderLevel')} /></Field>
        <label className="check full"><input type="checkbox" checked={v.trackedSerial} onChange={(e) => f.set('trackedSerial', e.target.checked)} /> Track each unit by serial number</label>
      </div>
    </Modal>
  );
}

export default function Catalog() {
  const user = useCurrentUser();
  const [tab, setTab] = useState('packages');
  const [kind, setKind] = useState('');
  const prods = useAsync(() => get('/catalog/products'));
  const pkgs = useAsync(() => get('/catalog/packages'));
  const [edit, setEdit] = useState<any>(null);
  const [open, setOpen] = useState<any>(null);
  return (
    <>
      <PageHead title="Products & packages" sub="Package templates define the exact parts for every quote" actions={tab === 'products' && can(user, 'warehouse') && <button className="btn" onClick={() => setEdit({})}><Icon n="plus" />New product</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[['packages', 'Packages (bill of materials)'], ['products', 'Products']]} />

      {tab === 'packages' && <Async state={pkgs}>{(rows: any[]) => {
        const shown = rows.filter((p) => !kind || p.kind === kind);
        const kinds = [...new Set(rows.map((p) => p.kind))] as string[];
        return (
          <div className="page-stack">
            <KpiRow>
              <Kpi icon="sun" tone="indigo" label="Packages" value={rows.length} sub="ready to quote" />
              <Kpi icon="zap" tone="blue" label="On-grid" value={rows.filter((p) => p.kind === 'on_grid').length} sub="grid-connected systems" />
              <Kpi icon="cube" tone="amber" label="Off-grid" value={rows.filter((p) => p.kind === 'off_grid').length} sub="with battery backup" />
              <Kpi icon="wallet" tone="green" label="Price range" value={rows.length ? `${money(Math.min(...rows.map((p) => Number(p.list_price))))}+` : '-'} sub="list price, before GST" />
            </KpiRow>
            <Chips value={kind} onChange={setKind} options={[{ value: '', label: 'All', count: rows.length }, ...kinds.map((k) => ({ value: k, label: label(k), count: rows.filter((p) => p.kind === k).length }))]} />
            <div className="pcards">{shown.map((p) => (
              <article key={p.id} className="pcard">
                <div className="pcard-top">
                  <div className="pcard-kw">{p.capacity_kw ? <>{p.capacity_kw}<small>kW</small></> : <small style={{ marginLeft: 0 }}>Add-on</small>}</div>
                  <Tag tone={p.kind === 'off_grid' ? 'amber' : p.kind === 'on_grid' ? 'blue' : 'slate'}>{label(p.kind)}</Tag>
                </div>
                <h3>{p.name}</h3>
                <div className="pcard-price">{money(p.list_price)}<span className="muted small" style={{ fontWeight: 500 }}> before GST</span></div>
                <p>{p.description}</p>
                <button className="btn sm secondary" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Hide' : 'Show'} {p.items.length} parts</button>
                {open === p.id && <ul className="bom">{p.items.map((i) => <li key={i.productId}><b className="soft" style={{ fontWeight: 550 }}>{i.name}</b><span>×{i.quantity}</span></li>)}</ul>}
              </article>))}</div>
          </div>
        );
      }}</Async>}

      {tab === 'products' && <Async state={prods}>{(rows: any[]) => {
        const real = rows.filter((r) => Number(r.sell_price) > 0);
        const avg = real.length ? Math.round(real.reduce((a, r) => a + ((r.sell_price - r.cost_price) / r.sell_price) * 100, 0) / real.length) : 0;
        return (
          <div className="page-stack">
            <KpiRow>
              <Kpi icon="cube" tone="indigo" label="Products" value={rows.length} sub={`${new Set(rows.map((r) => r.category)).size} categories`} />
              <Kpi icon="search" tone="violet" label="Serial-tracked" value={rows.filter((r) => r.tracked_serial).length} sub="each unit has a serial no." />
              <Kpi icon="trend" tone="green" label="Average margin" value={`${avg}%`} sub="selling price over cost" />
              <Kpi icon="alert" tone="amber" label="Low margin" value={real.filter((r) => ((r.sell_price - r.cost_price) / r.sell_price) * 100 < 15).length} sub="products under 15%" />
            </KpiRow>
            <Card pad={false}>
              <div className="table-wrap"><table>
                <thead><tr><th>Product</th><th>Category</th><th className="num">Cost</th><th className="num">Price</th><th style={{ width: 170 }}>Margin</th><th>Tracking</th><th /></tr></thead>
                <tbody>{rows.map((r) => {
                  const m = r.sell_price ? Math.round(((r.sell_price - r.cost_price) / r.sell_price) * 100) : 0;
                  return (
                    <tr key={r.product_id}>
                      <td><b>{r.name}</b><span className="sub-line"><span className="mono">{r.sku}</span></span></td>
                      <td><Tag tone="slate">{label(r.category)}</Tag></td>
                      <td className="num">{money(r.cost_price)}</td>
                      <td className="num"><span className="amt">{money(r.sell_price)}</span></td>
                      <td><Meter value={m} max={50} tone={m < 15 ? 'amber' : 'green'} caption={`${m}%`} /></td>
                      <td>{r.tracked_serial ? <Tag tone="violet">Serial no.</Tag> : <Tag>Quantity</Tag>}</td>
                      <td className="right">{can(user, 'warehouse') && <button className="btn sm secondary" onClick={() => setEdit(r)}>Edit</button>}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            </Card>
          </div>
        );
      }}</Async>}
      {edit && <ProductForm p={edit.sku ? edit : null} onClose={() => setEdit(null)} onDone={() => { setEdit(null); prods.reload(); pkgs.reload(); }} />}
    </>
  );
}
