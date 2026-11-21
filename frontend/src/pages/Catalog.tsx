import { useState } from 'react';
import { get, post, put } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Field, Modal, PageHead, Tabs, label, money, useAction, useAsync, useForm } from '../components/ui';
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
  const prods = useAsync(() => get('/catalog/products'));
  const pkgs = useAsync(() => get('/catalog/packages'));
  const [edit, setEdit] = useState<any>(null);
  const [open, setOpen] = useState<any>(null);
  return (
    <>
      <PageHead title="Products & packages" sub="Package templates define the exact parts for every quote" actions={tab === 'products' && can(user, 'warehouse') && <button className="btn" onClick={() => setEdit({})}>+ New product</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[['packages', 'Packages (bill of materials)'], ['products', 'Products']]} />
      {tab === 'packages' && <Async state={pkgs}>{(rows) => (
        <div className="grid g3">{rows.map((p) => (
          <Card key={p.id} title={p.name} actions={<Badge status={p.kind === 'off_grid' ? 'warn' : 'info'}>{label(p.kind)}</Badge>}>
            <p className="muted small" style={{ marginTop: 0 }}>{p.description}</p>
            <div className="row between"><b style={{ fontSize: '1.2rem' }}>{money(p.list_price)}</b><button className="btn sm secondary" onClick={() => setOpen(open === p.id ? null : p.id)}>{p.items.length} parts {open === p.id ? '▲' : '▼'}</button></div>
            {open === p.id && <table style={{ marginTop: 10 }}><tbody>{p.items.map((i) => <tr key={i.productId}><td style={{ padding: '5px 0' }} className="small">{i.name}</td><td className="num small" style={{ padding: '5px 0' }}>×{i.quantity}</td></tr>)}</tbody></table>}
          </Card>))}</div>)}</Async>}
      {tab === 'products' && <Card pad={false}><Async state={prods}>{(rows) => (
        <div className="table-wrap"><table>
          <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th className="num">Cost</th><th className="num">Price</th><th className="num">Margin</th><th>Serial</th><th /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.product_id}><td className="mono">{r.sku}</td><td>{r.name}</td><td style={{ textTransform: 'capitalize' }}>{label(r.category)}</td><td className="num">{money(r.cost_price)}</td><td className="num">{money(r.sell_price)}</td>
            <td className="num">{r.sell_price ? Math.round(((r.sell_price - r.cost_price) / r.sell_price) * 100) : 0}%</td><td>{r.tracked_serial ? '✓' : ''}</td>
            <td className="right">{can(user, 'warehouse') && <button className="btn sm secondary" onClick={() => setEdit(r)}>Edit</button>}</td></tr>)}</tbody>
        </table></div>)}</Async></Card>}
      {edit && <ProductForm p={edit.sku ? edit : null} onClose={() => setEdit(null)} onDone={() => { setEdit(null); prods.reload(); pkgs.reload(); }} />}
    </>
  );
}
