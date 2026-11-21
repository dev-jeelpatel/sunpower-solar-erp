import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, Pager, Tabs, fmtDate, label, money, useAction, useAsync, useDebounced, useForm, useToast } from '../components/ui';
import { validate, required, positive } from '../validators';

function Stock() {
  const state = useAsync(() => get('/inventory/stock'));
  const [cat, setCat] = useState('');
  return (
    <>
      <div className="toolbar"><select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>
        {['panel', 'inverter', 'battery', 'charge_controller', 'wiring_box', 'switch', 'earthing', 'stand', 'cable', 'connector'].map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></div>
      <Card pad={false}><Async state={state}>{(rows) => (
        <div className="table-wrap"><table>
          <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Tracking</th><th className="num">On hand</th><th className="num">Committed</th><th className="num">Available</th><th className="num">Reorder at</th><th /></tr></thead>
          <tbody>{rows.filter((r) => r.category !== 'service' && (!cat || r.category === cat)).map((r) => (
            <tr key={r.product_id}><td className="mono">{r.sku}</td><td>{r.name}</td><td style={{ textTransform: 'capitalize' }}>{label(r.category)}</td><td>{r.tracked_serial ? <Badge status="info">Serial</Badge> : <span className="muted">Quantity</span>}</td>
              <td className="num"><b>{r.on_hand}</b></td><td className="num">{r.committed || '-'}</td><td className="num" style={{ color: r.available < 0 ? 'var(--bad)' : undefined }}>{r.available}</td><td className="num">{r.reorder_level}</td>
              <td>{r.low && <Badge status="low_stock">Reorder</Badge>}</td></tr>))}</tbody>
        </table></div>)}</Async></Card>
    </>
  );
}

function Serials() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const state = useAsync(() => get(`/inventory/units?page=${page}&limit=25&q=${encodeURIComponent(dq)}&status=${status}`), [page, dq, status]);
  return (
    <>
      <div className="toolbar"><input className="search" placeholder="Search serial number…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{['in_stock', 'dispatched', 'delivered', 'faulty'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
      <Card pad={false}><Async state={state}>{(d) => d.items.length === 0 ? <Empty>No units.</Empty> : (
        <><div className="table-wrap"><table>
          <thead><tr><th>Serial</th><th>Product</th><th>Status</th><th>Customer</th><th>Warranty until</th></tr></thead>
          <tbody>{d.items.map((u) => <tr key={u.id}><td className="mono"><Link to={`/lookup?serial=${u.serial_no}`}>{u.serial_no}</Link></td><td>{u.product_name}</td><td><Badge status={u.status} /></td><td>{u.customer_name || '-'}</td>
            <td>{u.warranty_end ? <>{fmtDate(u.warranty_end)} <Badge status={u.warranty_state} /></> : '-'}</td></tr>)}</tbody>
        </table></div><Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} /></>)}</Async></Card>
    </>
  );
}

function Receive({ po, onClose, onDone }) {
  const [serials, setSerials] = useState<any>({});
  const { run, busy, error } = useAction();
  const f = useForm({});
  const parse = (txt) => [...new Set(txt.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const submit = async () => {
    const lines = po.items.map((i) => ({ itemId: i.id, serials: i.tracked_serial ? parse(serials[i.id] || '') : [] }));
    const bad = po.items.find((i, k) => i.tracked_serial && lines[k].serials.length !== i.quantity);
    if (bad) { f.setErrors({ [bad.id]: `${bad.sku}: enter exactly ${bad.quantity} serial numbers` }); return; }
    if (await run(() => post(`/inventory/purchases/${po.id}/receive`, { lines }), 'Stock received')) onDone();
  };
  return (
    <Modal title={`Receive ${po.po_no}`} wide onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>Confirm receipt</button></>}>
      {error && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">{po.items.map((i) => (
        <Field key={i.id} label={`${i.name} × ${i.quantity}`} error={f.errors[i.id]} hint={i.tracked_serial ? 'Paste or scan serial numbers: one per line' : 'Quantity item: no serials needed'}>
          {i.tracked_serial ? <textarea rows={Math.min(i.quantity, 6)} className="mono" placeholder="SN-0001&#10;SN-0002" value={serials[i.id] || ''} onChange={(e) => setSerials({ ...serials, [i.id]: e.target.value })} />
            : <input disabled value={`${i.quantity} units`} />}
          {i.tracked_serial && <span className="small muted">{parse(serials[i.id] || '').length} / {i.quantity} entered</span>}
        </Field>))}</div>
    </Modal>
  );
}

function NewPO({ onClose, onDone }) {
  const sup = useAsync(() => get('/inventory/suppliers'));
  const prods = useAsync(() => get('/catalog/products'));
  const f = useForm({ supplierId: '' });
  const [items, setItems] = useState([{ productId: '', quantity: '', unitCost: '' }]);
  const { run, busy, error } = useAction(f.setErrors);
  const upd = (i, k, v) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v, ...(k === 'productId' ? { unitCost: prods.data?.find((p) => String(p.product_id) === v)?.cost_price ?? it.unitCost } : {}) } : it)));
  const submit = async () => {
    const errs = validate(f.values, { supplierId: [required('Supplier')] });
    if (items.some((i) => !i.productId || !(Number(i.quantity) > 0) || i.unitCost === '')) errs.items = 'Complete every line: product, quantity and unit cost';
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => post('/inventory/purchases', { supplierId: Number(f.values.supplierId), items: items.map((i) => ({ productId: Number(i.productId), quantity: Number(i.quantity), unitCost: Number(i.unitCost) })) }), 'Purchase order created')) onDone();
  };
  return (
    <Modal title="New purchase order" wide onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>Create PO</button></>}>
      {error && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">
        <Field label="Supplier" error={f.errors.supplierId}><select {...f.bind('supplierId')}><option value="">Select…</option>{(sup.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        {items.map((it, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
            <Field label={i === 0 ? 'Product' : ''} className="grow"><select value={it.productId} onChange={(e) => upd(i, 'productId', e.target.value)}><option value="">Select…</option>{(prods.data || []).filter((p) => p.category !== 'service').map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}</select></Field>
            <Field label={i === 0 ? 'Qty' : ''} className="" ><input type="number" min="1" style={{ width: 90 }} value={it.quantity} onChange={(e) => upd(i, 'quantity', e.target.value)} /></Field>
            <Field label={i === 0 ? 'Unit cost' : ''}><input type="number" min="0" style={{ width: 120 }} value={it.unitCost} onChange={(e) => upd(i, 'unitCost', e.target.value)} /></Field>
            {items.length > 1 && <button className="btn secondary sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>}
          </div>))}
        {f.errors.items && <span className="err" style={{ color: 'var(--bad)' }}>{f.errors.items}</span>}
        <div><button className="btn secondary sm" onClick={() => setItems([...items, { productId: '', quantity: '', unitCost: '' }])}>+ Add line</button></div>
      </div>
    </Modal>
  );
}

function Purchases() {
  const user = useCurrentUser();
  const state = useAsync(() => get('/inventory/purchases'));
  const [modal, setModal] = useState<any>(null);
  const open = async (id) => setModal({ type: 'receive', po: await get(`/inventory/purchases/${id}`) });
  return (
    <>
      <div className="toolbar">{can(user, 'warehouse') && <button className="btn" onClick={() => setModal({ type: 'new' })}>+ New purchase order</button>}</div>
      <Card pad={false}><Async state={state}>{(rows) => rows.length === 0 ? <Empty>No purchase orders.</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>PO</th><th>Supplier</th><th>Ordered</th><th className="num">Units</th><th className="num">Value</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.id}><td><b>{p.po_no}</b></td><td>{p.supplier_name}</td><td>{fmtDate(p.ordered_at)}</td><td className="num">{p.units}</td><td className="num">{money(p.total)}</td><td><Badge status={p.status} /></td>
            <td className="right">{p.status === 'ordered' && can(user, 'warehouse') && <button className="btn sm" onClick={() => open(p.id)}>Receive goods</button>}</td></tr>)}</tbody>
        </table></div>)}</Async></Card>
      {modal?.type === 'new' && <NewPO onClose={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />}
      {modal?.type === 'receive' && <Receive po={modal.po} onClose={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />}
    </>
  );
}

export default function Inventory() {
  const [tab, setTab] = useState('stock');
  return (
    <>
      <PageHead title="Inventory" sub="Stock levels, serial numbers and goods receipts" />
      <Tabs value={tab} onChange={setTab} tabs={[['stock', 'Stock levels'], ['serials', 'Serial numbers'], ['purchases', 'Purchases']]} />
      {tab === 'stock' && <Stock />}{tab === 'serials' && <Serials />}{tab === 'purchases' && <Purchases />}
    </>
  );
}
