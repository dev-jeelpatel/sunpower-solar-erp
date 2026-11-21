import { useState } from 'react';
import { del, get, post, put } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Confirm, Field, Modal, PageHead, Tabs, label, money, useAction, useAsync, useForm, useToast } from '../components/ui';
import { Chips, Kpi, KpiRow, Meter, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
import { validate, required, minLen } from '../validators';
import * as V from '../validators';

const CATS = ['panel', 'inverter', 'battery', 'charge_controller', 'wiring_box', 'switch', 'earthing', 'stand', 'cable', 'connector', 'service'];

function ProductForm({ p, onClose, onDone }) {
  const f = useForm({ sku: p?.sku || '', name: p?.name || '', category: p?.category || 'panel', trackedSerial: p?.tracked_serial || false, warrantyMonths: p?.warranty_months ?? 0 /* not in v_stock */, costPrice: p?.cost_price ?? '', sellPrice: p?.sell_price ?? '', reorderLevel: p?.reorder_level ?? 0 });
  const { run, busy, error } = useAction(f.setErrors);
  const v = f.values;
  const submit = async () => {
    const errs = validate(v, { sku: [required('SKU'), V.skuCode], name: [required('Name'), minLen(3, 'Name'), V.noMarkup('Name')], costPrice: [required('Cost price'), V.moneyAmount('Cost price', 0, 10000000)], sellPrice: [required('Selling price'), V.moneyAmount('Selling price', 0, 10000000)], warrantyMonths: [V.wholeNumber('Warranty', 0, 600)], reorderLevel: [V.wholeNumber('Reorder level', 0, 100000)] });
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
        <Field label="SKU" rules={[V.required('SKU'), V.skuCode]} error={f.errors.sku}><input {...f.bind('sku')} style={{ textTransform: 'uppercase' }} /></Field>
        <Field label="Category" error={f.errors.category}><select {...f.bind('category')}>{CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></Field>
        <Field label="Name" rules={[V.required('Name'), V.minLen(3, 'Name'), V.noMarkup('Name')]} className="full" error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Cost price (₹)" rules={[V.required('Cost price'), V.moneyAmount('Cost price', 0, 10000000)]} error={f.errors.costPrice}><input type="number" min="0" {...f.bind('costPrice')} /></Field>
        <Field label="Selling price (₹)" rules={[V.required('Selling price'), V.moneyAmount('Selling price', 0, 10000000)]} error={f.errors.sellPrice}><input type="number" min="0" {...f.bind('sellPrice')} /></Field>
        <Field label="Warranty (months)" rules={[V.wholeNumber('Warranty', 0, 600)]} hint="Starts automatically at delivery" error={f.errors.warrantyMonths}><input type="number" min="0" {...f.bind('warrantyMonths')} /></Field>
        <Field label="Reorder level" rules={[V.wholeNumber('Reorder level', 0, 100000)]} error={f.errors.reorderLevel}><input type="number" min="0" {...f.bind('reorderLevel')} /></Field>
        <label className="check full"><input type="checkbox" checked={v.trackedSerial} onChange={(e) => f.set('trackedSerial', e.target.checked)} /> Track each unit by serial number</label>
      </div>
    </Modal>
  );
}

function PackageForm({ pkg, products, onClose, onDone }) {
  const f = useForm({ name: pkg?.name || '', kind: pkg?.kind || 'on_grid', capacityKw: pkg?.capacity_kw ?? '', description: pkg?.description || '' });
  const [items, setItems] = useState<any[]>(pkg?.items?.map((i) => ({ productId: String(i.productId), quantity: String(i.quantity) })) || [{ productId: '', quantity: '1' }]);
  const { run, busy, error } = useAction(f.setErrors);
  const v = f.values;
  const grid = ['on_grid', 'off_grid'].includes(v.kind);
  const set = (i, k, val) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: val } : it)));
  const submit = async () => {
    const errs: Record<string, string> = validate(v, { name: [required('Name'), minLen(3, 'Name')] });
    if (grid && !(Number(v.capacityKw) >= 1 && Number(v.capacityKw) <= 5)) errs.capacityKw = 'Capacity must be 1 to 5 kW';
    if (items.some((i) => !i.productId || !(Number(i.quantity) >= 1))) errs.items = 'Choose a product and quantity for every line';
    else if (new Set(items.map((i) => i.productId)).size !== items.length) errs.items = 'Each product can appear only once';
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = { name: v.name, kind: v.kind, capacityKw: grid ? Number(v.capacityKw) : undefined, description: v.description, items: items.map((i) => ({ productId: Number(i.productId), quantity: Number(i.quantity) })) };
    if (await run(() => (pkg ? put(`/catalog/packages/${pkg.id}`, body) : post('/catalog/packages', body)), 'Package saved')) onDone();
  };
  return (
    <Modal title={pkg ? 'Edit package' : 'New package'} onClose={onClose} wide footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Save</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Package name" rules={[V.required('Package name'), V.minLen(3, 'Package name'), V.noMarkup('Package name')]} className="full" error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Type"><select {...f.bind('kind')}><option value="on_grid">On-grid</option><option value="off_grid">Off-grid</option><option value="hardware">Hardware</option><option value="service">Service</option></select></Field>
        {grid && <Field label="Capacity (kW)" rules={[V.wholeNumber('Capacity', 1, 5)]} error={f.errors.capacityKw}><input type="number" min="1" max="5" {...f.bind('capacityKw')} /></Field>}
        <Field label="Description" rules={[V.safeText('Description', 500)]} className="full"><input {...f.bind('description')} /></Field>
      </div>
      <h4 style={{ margin: '16px 0 8px' }}>Parts in this package</h4>
      <div className="stack">
        {items.map((it, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
            <Field label={i === 0 ? 'Product' : ''} className="grow"><select value={it.productId} onChange={(e) => set(i, 'productId', e.target.value)}><option value="">Select…</option>{products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}</select></Field>
            <Field label={i === 0 ? 'Qty' : ''}><input type="number" min="1" style={{ width: 90 }} value={it.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} /></Field>
            {items.length > 1 && <button type="button" className="btn secondary sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>}
          </div>))}
        {f.errors.items && <span style={{ color: 'var(--bad)' }}>{f.errors.items}</span>}
        <div><button type="button" className="btn secondary sm" onClick={() => setItems([...items, { productId: '', quantity: '1' }])}>+ Add part</button></div>
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
  const [pkgEdit, setPkgEdit] = useState<any>(null);
  const [ask, setAsk] = useState<any>(null);
  const { run } = useAction();
  const toast = useToast();
  const isAdmin = can(user);
  const reloadAll = () => { prods.reload(); pkgs.reload(); };
  const confirmDelete = async () => {
    const a = ask; setAsk(null);
    if (a.type === 'package') { if (await run(() => del(`/catalog/packages/${a.item.id}`), 'Package deleted')) reloadAll(); }
    else { const r: any = await run(() => del(`/catalog/products/${a.item.product_id}`)); if (r) { toast(r.hidden ? 'Product hidden (it has history)' : 'Product deleted', 'ok'); reloadAll(); } }
  };
  return (
    <>
      <PageHead title="Products & packages" sub="Package templates define the exact parts for every quote" actions={tab === 'products' ? can(user, 'warehouse') && <button className="btn" onClick={() => setEdit({})}><Icon n="plus" />New product</button> : isAdmin && <button className="btn" onClick={() => setPkgEdit({})}><Icon n="plus" />New package</button>} />
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
                {isAdmin && <span className="pcard-actions"><button className="btn sm secondary" onClick={() => setPkgEdit(p)}>Edit</button><button className="btn sm secondary danger-text" onClick={() => setAsk({ type: 'package', item: p })}>Delete</button></span>}
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
                      <td className="right nowrap">{can(user, 'warehouse') && <><button className="btn sm secondary" onClick={() => setEdit(r)}>Edit</button> <button className="btn sm secondary danger-text" onClick={() => setAsk({ type: 'product', item: r })}>Delete</button></>}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            </Card>
          </div>
        );
      }}</Async>}
      {pkgEdit && <PackageForm pkg={pkgEdit.id ? pkgEdit : null} products={(prods.data || []).filter((p) => p.active !== false)} onClose={() => setPkgEdit(null)} onDone={() => { setPkgEdit(null); reloadAll(); }} />}
      {ask && <Confirm danger yesLabel="Delete" title={ask.type === 'package' ? 'Delete package?' : 'Delete product?'} onNo={() => setAsk(null)} onYes={confirmDelete}
        message={ask.type === 'package' ? <>“{ask.item.name}” will no longer be offered for new quotes. Existing quotes and orders keep their own copy.</> : <>“{ask.item.name}” will be removed. If it already appears on quotes, orders or stock, it is hidden instead so your records stay intact.</>} />}
      {edit && <ProductForm p={edit.sku ? edit : null} onClose={() => setEdit(null)} onDone={() => { setEdit(null); prods.reload(); pkgs.reload(); }} />}
    </>
  );
}
