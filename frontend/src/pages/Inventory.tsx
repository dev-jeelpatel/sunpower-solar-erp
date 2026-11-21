import { useState } from 'react';
import { Link } from 'react-router-dom';
import { del, get, post, put } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Confirm, Empty, Field, Modal, PageHead, Pager, Seg, Tabs, fmtDate, label, money, useAction, useAsync, useDebounced, useForm, useToast } from '../components/ui';
import { Chips, Kpi, KpiRow, Meter, Person, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
import { validate, required, positive, isPhone, isEmail, businessName } from '../validators';

const CAT_ICON: Record<string, IconName> = {
  panel: 'sun', inverter: 'zap', battery: 'cube', charge_controller: 'zap', wiring_box: 'box', switch: 'zap',
  earthing: 'shield', stand: 'wrench', cable: 'chart', connector: 'wrench',
};

function AdjustStock({ p, onClose, onDone }) {
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const { run, busy, error } = useAction();
  const n = Math.floor(Number(qty)) || 0;
  const change = mode === 'add' ? n : -n;
  const after = Number(p.on_hand) + change;
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!(n > 0)) e.qty = 'Enter how many';
    else if (after < 0) e.qty = `Only ${p.on_hand} in stock`;
    if (reason.trim().length < 3) e.reason = 'Give a short reason';
    setErr(e);
    if (Object.keys(e).length) return;
    if (await run(() => post('/inventory/stock/adjust', { productId: p.product_id, change, reason }), 'Stock updated')) onDone();
  };
  return (
    <Modal title={`Update stock: ${p.name}`} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>Save stock</button></>}>
      {error && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">
        <Seg value={mode} onChange={(v) => setMode(v as any)} options={[['add', 'Add stock'], ['remove', 'Remove stock']]} />
        <Field label="Quantity" error={err.qty}><input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></Field>
        <Field label="Reason" error={err.reason} hint="Saved in the history, e.g. Stock count correction, damaged, found in store"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="alert" style={{ margin: 0 }}>Now <b>{p.on_hand}</b> &rarr; after this change <b>{n ? after : p.on_hand}</b></div>
      </div>
    </Modal>
  );
}

function Stock() {
  const user = useCurrentUser();
  const wh = can(user, 'warehouse');
  const state = useAsync(() => get('/inventory/stock'));
  const [cat, setCat] = useState('');
  const [adj, setAdj] = useState<any>(null);
  return (
    <Async state={state}>{(all: any[]) => {
      const rows = all.filter((r) => r.category !== 'service');
      const cats = [...new Set(rows.map((r) => r.category))] as string[];
      const shown = rows.filter((r) => !cat || r.category === cat);
      const low = rows.filter((r) => r.low).length;
      return (
        <div className="page-stack">
          <KpiRow>
            <Kpi icon="cube" tone="indigo" label="Products" value={rows.length} sub={`${cats.length} categories`} />
            <Kpi icon="warehouse" tone="blue" label="Units on hand" value={rows.reduce((a, r) => a + Number(r.on_hand), 0).toLocaleString('en-IN')} sub="across all products" />
            <Kpi icon="truck" tone="amber" label="Committed" value={rows.reduce((a, r) => a + Number(r.committed || 0), 0).toLocaleString('en-IN')} sub="reserved for confirmed orders" />
            <Kpi icon="alert" tone={low ? 'rose' : 'green'} label="Low stock" value={low} sub={low ? 'at or below reorder level' : 'everything is healthy'} />
          </KpiRow>
          <Chips value={cat} onChange={setCat} options={[{ value: '', label: 'All', count: rows.length }, ...cats.map((c) => ({ value: c, label: label(c), count: rows.filter((r) => r.category === c).length }))]} />
          <Card pad={false}>
            <div className="table-wrap"><table>
              <thead><tr><th>Product</th><th>Tracking</th><th style={{ width: 220 }}>On hand</th><th className="num">Committed</th><th className="num">Available</th><th className="num">Reorder at</th><th>Status</th>{wh && <th />}</tr></thead>
              <tbody>{shown.map((r) => {
                const onHand = Number(r.on_hand), reorder = Number(r.reorder_level);
                const tone = r.low ? 'rose' : onHand < reorder * 1.5 ? 'amber' : 'green';
                return (
                  <tr key={r.product_id}>
                    <td><div className="cust"><span className="cat-ic"><Icon n={CAT_ICON[r.category] || 'cube'} /></span><div><b>{r.name}</b><small><span className="mono">{r.sku}</span> · {label(r.category)}</small></div></div></td>
                    <td>{r.tracked_serial ? <Tag tone="violet">Serial no.</Tag> : <Tag>Quantity</Tag>}</td>
                    <td><Meter value={onHand} max={Math.max(reorder * 3, onHand, 1)} tone={tone} caption={onHand.toLocaleString('en-IN')} /></td>
                    <td className="num">{r.committed || <span className="muted">-</span>}</td>
                    <td className="num"><span className={`amt ${Number(r.available) < 0 ? 'bad' : ''}`}>{r.available}</span></td>
                    <td className="num">{reorder}</td>
                    <td>{r.low ? <Tag tone="rose">Reorder now</Tag> : <Tag tone="green">In stock</Tag>}</td>
                    {wh && <td className="right nowrap">{r.tracked_serial ? <span className="muted small">via serials</span> : <button className="btn sm secondary" onClick={() => setAdj(r)}>Update stock</button>}</td>}
                  </tr>
                );
              })}</tbody>
            </table></div>
          </Card>
          {adj && <AdjustStock p={adj} onClose={() => setAdj(null)} onDone={() => { setAdj(null); state.reload(); }} />}
        </div>
      );
    }}</Async>
  );
}

function AddSerials({ onClose, onDone }) {
  const prods = useAsync(() => get('/catalog/products'));
  const [productId, setProductId] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [gen, setGen] = useState({ prefix: '', start: '1', pad: 3, count: '' });
  const { run, busy, error } = useAction();
  // picking a product suggests the next serial after the latest one already in the system
  const pick = async (id: string) => {
    setProductId(id);
    if (!id) return;
    try {
      const d: any = await get(`/inventory/units?productId=${id}&limit=1`);
      const m = /^(.*?)(\d+)$/.exec(d.items[0]?.serial_no || '');
      if (m) setGen((g) => ({ ...g, prefix: m[1], start: String(Number(m[2]) + 1), pad: m[2].length }));
    } catch { /* suggestion only */ }
  };
  const fill = () => {
    const n = Math.min(Math.floor(Number(gen.count)) || 0, 500), from = Math.floor(Number(gen.start)) || 1;
    if (!gen.prefix.trim() || n < 1) return setErr('Enter a prefix and how many serials to generate');
    setErr('');
    setText(Array.from({ length: n }, (_, i) => `${gen.prefix.trim().toUpperCase()}${String(from + i).padStart(gen.pad, '0')}`).join('\n'));
  };
  const list = [...new Set(text.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const submit = async () => {
    if (!productId) return setErr('Choose a product');
    if (!list.length) return setErr('Enter at least one serial number');
    setErr('');
    if (await run(() => post('/inventory/units', { productId: Number(productId), serials: list }), `${list.length} serial${list.length === 1 ? '' : 's'} added to stock`)) onDone();
  };
  return (
    <Modal title="Add serial numbers to stock" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>Add {list.length || ''} to stock</button></>}>
      {(error || err) && <div className="alert bad" style={{ marginBottom: 12 }}>{err || error}</div>}
      <div className="stack">
        <Field label="Product"><select value={productId} onChange={(e) => pick(e.target.value)}><option value="">Select…</option>{(prods.data || []).filter((p) => p.tracked_serial).map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}</select></Field>
        <div className="gen-box">
          <b className="small">Generate a run of serial numbers</b>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Prefix"><input className="mono" style={{ width: 110 }} value={gen.prefix} onChange={(e) => setGen({ ...gen, prefix: e.target.value.toUpperCase() })} placeholder="PNL-" /></Field>
            <Field label="Start at"><input type="number" min="1" style={{ width: 90 }} value={gen.start} onChange={(e) => setGen({ ...gen, start: e.target.value })} /></Field>
            <Field label="How many"><input type="number" min="1" max="500" style={{ width: 90 }} value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} placeholder="86" /></Field>
            <button type="button" className="btn secondary" onClick={fill}>Fill list</button>
          </div>
        </div>
        <Field label="Serial numbers" hint="Type or paste one per line, e.g. PNL-201"><textarea rows={6} className="mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={'PNL-201\nPNL-202'} /></Field>
        <span className="small muted">{list.length} entered. Each one is also written to the stock ledger.</span>
      </div>
    </Modal>
  );
}

function RenameSerial({ u, onClose, onDone }) {
  const [s, setS] = useState(u.serial_no);
  const { run, busy, error } = useAction();
  return (
    <Modal title="Correct serial number" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !s.trim()} onClick={async () => { if (await run(() => put(`/inventory/units/${u.id}`, { serial: s.trim().toUpperCase() }), 'Serial updated')) onDone(); }}>Save</button></>}>
      {error && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <Field label={`${u.product_name}`} hint="Only units still in stock can be renamed"><input className="mono" value={s} onChange={(e) => setS(e.target.value.toUpperCase())} /></Field>
    </Modal>
  );
}

function Serials() {
  const user = useCurrentUser();
  const wh = can(user, 'warehouse');
  const [modal, setModal] = useState<any>(null);
  const { run } = useAction();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const state = useAsync(() => get(`/inventory/units?page=${page}&limit=25&q=${encodeURIComponent(dq)}&status=${status}`), [page, dq, status]);
  return (
    <div className="page-stack">
      <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: 'All' }, ...['in_stock', 'dispatched', 'delivered', 'faulty'].map((s) => ({ value: s, label: label(s) }))]} />
      <div className="toolbar" style={{ margin: 0 }}><input className="search" placeholder="Search serial number…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />{wh && <button className="btn" onClick={() => setModal({ type: 'add' })}><Icon n="plus" />Add serials</button>}</div>
      <Card pad={false}><Async state={state}>{(d) => d.items.length === 0 ? <Empty>No units match.</Empty> : (
        <><div className="table-wrap"><table>
          <thead><tr><th>Serial number</th><th>Product</th><th>Status</th><th>Customer</th><th>Warranty</th>{wh && <th />}</tr></thead>
          <tbody>{d.items.map((u) => (
            <tr key={u.id}>
              <td><Link to={`/lookup?serial=${u.serial_no}`}><Tag tone="slate"><span className="mono">{u.serial_no}</span></Tag></Link></td>
              <td><b>{u.product_name}</b></td>
              <td><Badge status={u.status} /></td>
              <td>{u.customer_name ? <Person name={u.customer_name} /> : <span className="muted">Not assigned</span>}</td>
              <td>{u.warranty_end ? <><b className="soft">{fmtDate(u.warranty_end)}</b> <Badge status={u.warranty_state} /></> : <span className="muted">Starts on delivery</span>}</td>
              {wh && <td className="right nowrap">{u.status === 'in_stock' && <><button className="btn sm secondary" onClick={() => setModal({ type: 'rename', u })}>Edit</button> <button className="btn sm secondary danger-text" onClick={() => setModal({ type: 'delete', u })}>Delete</button></>}</td>}
            </tr>))}</tbody>
        </table></div><Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} /></>)}</Async></Card>
      {modal?.type === 'add' && <AddSerials onClose={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />}
      {modal?.type === 'rename' && <RenameSerial u={modal.u} onClose={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />}
      {modal?.type === 'delete' && <Confirm danger yesLabel="Delete" title="Delete this unit?" onNo={() => setModal(null)}
        onYes={async () => { const u = modal.u; setModal(null); if (await run(() => del(`/inventory/units/${u.id}`), 'Unit removed from stock')) state.reload(); }}
        message={<><b className="mono">{modal.u.serial_no}</b> is still in stock. Deleting it removes the unit and lowers the stock count by one.</>} />}
    </div>
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
  const { run } = useAction();
  const open = async (id) => setModal({ type: 'receive', po: await get(`/inventory/purchases/${id}`) });
  return (
    <>
      <div className="toolbar">{can(user, 'warehouse') && <button className="btn" onClick={() => setModal({ type: 'new' })}>+ New purchase order</button>}</div>
      <Card pad={false}><Async state={state}>{(rows) => rows.length === 0 ? <Empty>No purchase orders.</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>PO</th><th>Supplier</th><th>Ordered</th><th className="num">Units</th><th className="num">Value</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.id}><td><b>{p.po_no}</b></td><td>{p.supplier_name}</td><td>{fmtDate(p.ordered_at)}</td><td className="num">{p.units}</td><td className="num">{money(p.total)}</td><td><Badge status={p.status} /></td>
            <td className="right">{p.status === 'ordered' && can(user, 'warehouse') && <><button className="btn sm" onClick={() => open(p.id)}>Receive goods</button> <button className="btn sm secondary danger-text" onClick={() => setModal({ type: 'cancel', po: p })}>Cancel</button></>}</td></tr>)}</tbody>
        </table></div>)}</Async></Card>
      {modal?.type === 'cancel' && <Confirm danger yesLabel="Cancel PO" title="Cancel purchase order?" onNo={() => setModal(null)}
        onYes={async () => { const p = modal.po; setModal(null); if (await run(() => post(`/inventory/purchases/${p.id}/cancel`), 'Purchase order cancelled')) state.reload(); }}
        message={<>{modal.po.po_no} to {modal.po.supplier_name} will be marked cancelled. Nothing has been received, so stock is not affected.</>} />}
      {modal?.type === 'new' && <NewPO onClose={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />}
      {modal?.type === 'receive' && <Receive po={modal.po} onClose={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />}
    </>
  );
}

function SupplierForm({ s, onClose, onDone }) {
  const f = useForm({ name: s?.name || '', phone: s?.phone || '', email: s?.email || '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const v = f.values;
    const errs: Record<string, string> = {};
    const nameErr = v.name.trim() ? businessName('Supplier name')(v.name) : 'Enter the supplier name';
    if (nameErr) errs.name = nameErr;
    if (v.phone && !isPhone(v.phone)) errs.phone = 'Enter a valid 10-digit mobile number';
    if (v.email && !isEmail(v.email)) errs.email = 'Enter a valid email address';
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => (s ? put(`/inventory/suppliers/${s.id}`, v) : post('/inventory/suppliers', v)), 'Supplier saved')) onDone();
  };
  return (
    <Modal title={s ? 'Edit supplier' : 'New supplier'} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>Save</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Supplier name" className="full" error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Phone" error={f.errors.phone}><input {...f.bind('phone')} /></Field>
        <Field label="Email" error={f.errors.email}><input type="email" {...f.bind('email')} /></Field>
      </div>
    </Modal>
  );
}

function Suppliers() {
  const user = useCurrentUser();
  const wh = can(user, 'warehouse');
  const state = useAsync(() => get('/inventory/suppliers'));
  const [modal, setModal] = useState<any>(null);
  const { run } = useAction();
  return (
    <>
      <div className="toolbar">{wh && <button className="btn" onClick={() => setModal({ type: 'form' })}><Icon n="plus" />New supplier</button>}</div>
      <Card pad={false}><Async state={state}>{(rows: any[]) => rows.length === 0 ? <Empty>No suppliers yet.</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Supplier</th><th>Phone</th><th>Email</th>{wh && <th />}</tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id}><td><b>{s.name}</b></td><td>{s.phone || <span className="muted">-</span>}</td><td>{s.email || <span className="muted">-</span>}</td>
              {wh && <td className="right nowrap"><button className="btn sm secondary" onClick={() => setModal({ type: 'form', s })}>Edit</button> <button className="btn sm secondary danger-text" onClick={() => setModal({ type: 'delete', s })}>Delete</button></td>}</tr>))}</tbody>
        </table></div>)}</Async></Card>
      {modal?.type === 'form' && <SupplierForm s={modal.s} onClose={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />}
      {modal?.type === 'delete' && <Confirm danger yesLabel="Delete" title="Delete supplier?" onNo={() => setModal(null)}
        onYes={async () => { const s = modal.s; setModal(null); if (await run(() => del(`/inventory/suppliers/${s.id}`), 'Supplier deleted')) state.reload(); }}
        message={<>“{modal.s.name}” will be removed. A supplier that already has purchase orders cannot be deleted.</>} />}
    </>
  );
}

export default function Inventory() {
  const [tab, setTab] = useState('stock');
  return (
    <>
      <PageHead title="Inventory" sub="Stock levels, serial numbers and goods receipts" />
      <Tabs value={tab} onChange={setTab} tabs={[['stock', 'Stock levels'], ['serials', 'Serial numbers'], ['purchases', 'Purchases'], ['suppliers', 'Suppliers']]} />
      {tab === 'stock' && <Stock />}{tab === 'serials' && <Serials />}{tab === 'purchases' && <Purchases />}{tab === 'suppliers' && <Suppliers />}
    </>
  );
}
