import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { del, get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Field, Modal, PageHead, fmtDate, fmtDateTime, label, money, useAction, useAsync, useForm } from '../components/ui';
import { validate, required, minLen, positive } from '../validators';

function LineModal({ t, onClose, onDone }) {
  const prods = useAsync(() => get('/catalog/products'));
  const f = useForm({ kind: 'part', productId: '', description: '', quantity: '1', unitPrice: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const v = f.values;
  const pick = (id) => { f.set('productId', id); const p = prods.data?.find((x) => String(x.product_id) === id); if (p) f.setValues((s) => ({ ...s, productId: id, unitPrice: String(p.sell_price) })); };
  const submit = async () => {
    const errs = validate(v, { quantity: [required('Quantity'), positive('Quantity')], ...(v.kind === 'part' ? { productId: [required('Part')] } : { description: [required('Description')], unitPrice: [required('Rate')] }) });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => post(`/tickets/${t.id}/lines`, { productId: v.kind === 'part' ? Number(v.productId) : undefined, description: v.description || undefined, quantity: Number(v.quantity), unitPrice: v.unitPrice === '' ? undefined : Number(v.unitPrice), isLabour: v.kind === 'labour' }), 'Line added');
    if (ok) onDone();
  };
  return (
    <Modal title="Add part or labour" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Add</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Type" className="full"><select {...f.bind('kind')}><option value="part">Spare part from stock</option><option value="labour">Labour / service charge</option></select></Field>
        {v.kind === 'part' ? <Field label="Part" error={f.errors.productId} className="full"><select value={v.productId} onChange={(e) => pick(e.target.value)}><option value="">Select…</option>{(prods.data || []).filter((p) => p.category !== 'service' && !p.tracked_serial).map((p) => <option key={p.product_id} value={p.product_id}>{p.name} ({p.on_hand} in stock)</option>)}</select></Field>
          : <Field label="Description" error={f.errors.description} className="full"><input {...f.bind('description')} placeholder="e.g. Site visit & diagnosis" /></Field>}
        <Field label="Quantity / hours" error={f.errors.quantity}><input type="number" step="0.5" {...f.bind('quantity')} /></Field>
        <Field label="Rate (₹)" error={f.errors.unitPrice}><input type="number" {...f.bind('unitPrice')} /></Field>
      </div>
    </Modal>
  );
}

function ResolveModal({ t, onClose, onDone }) {
  const f = useForm({ resolution: '', replacementSerial: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const errs = validate(f.values, { resolution: [required('Resolution'), minLen(5, 'Resolution')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => post(`/tickets/${t.id}/resolve`, { resolution: f.values.resolution, replacementSerial: f.values.replacementSerial || undefined }), 'Ticket resolved')) onDone();
  };
  return (
    <Modal title="Resolve ticket" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn ok" onClick={submit} disabled={busy}>Mark resolved</button></>}>
      <div className={`alert ${t.warranty_status === 'in_warranty' ? 'ok' : 'warn'}`} style={{ marginBottom: 12 }}>
        {t.warranty_status === 'in_warranty' ? 'In warranty: this repair is free for the customer.' : 'Out of warranty: parts and labour lines will be billed automatically with GST.'}</div>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">
        <Field label="What was done" error={f.errors.resolution}><textarea {...f.bind('resolution')} /></Field>
        {t.serial_no && <Field label="Replacement unit serial (if swapped)" error={f.errors.replacementSerial} hint="The faulty unit is marked faulty and the new unit gets a fresh warranty"><input className="mono" {...f.bind('replacementSerial')} onChange={(e) => f.set('replacementSerial', e.target.value.toUpperCase())} /></Field>}
      </div>
    </Modal>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const user = useCurrentUser();
  const state = useAsync(() => get(`/tickets/${id}`), [id]);
  const staff = useAsync(() => get('/users'));
  const [modal, setModal] = useState<any>(null);
  const { run, busy } = useAction();
  const done = () => { setModal(null); state.reload(); };
  const act = async (path, msg) => { if (await run(() => post(`/tickets/${id}/${path}`), msg)) state.reload(); };
  const support = can(user, 'support');

  return (
    <Async state={state}>{(t) => {
      const openish = ['open', 'assigned'].includes(t.status);
      const total = t.lines.reduce((s, l) => s + l.quantity * l.billed_price, 0);
      return (
        <>
          <PageHead crumb={<div className="crumb"><Link to="/tickets">← Tickets</Link></div>} title={`${t.ticket_no}: ${t.subject}`} sub={<><Badge status={t.status} /> <Badge status={t.priority} /> <Badge status={t.warranty_status} /></>}
            actions={<>
              {openish && can(user, 'support', 'technician') && <button className="btn secondary" onClick={() => setModal('line')}>+ Part / labour</button>}
              {openish && can(user, 'support', 'technician') && <button className="btn ok" onClick={() => setModal('resolve')}>Resolve</button>}
              {t.status === 'resolved' && support && <><button className="btn secondary" disabled={busy} onClick={() => act('reopen', 'Ticket reopened')}>Not fixed: reopen</button><button className="btn ok" disabled={busy} onClick={() => act('confirm', 'Ticket closed')}>Customer confirms it works</button></>}
            </>} />
          <div className="grid split">
            <div className="stack">
              <Card title="Complaint"><dl className="kv">
                <dt>Customer</dt><dd><Link to={`/customers?id=${t.customer_id}`}><b>{t.customer_name}</b></Link> · <a href={`tel:${t.phone}`}>{t.phone}</a><div className="muted small">{t.address}</div></dd>
                <dt>Unit</dt><dd>{t.product_name ? <>{t.product_name} · <Link className="mono" to={`/lookup?serial=${t.serial_no}`}>{t.serial_no}</Link></> : '-'}</dd>
                <dt>Warranty</dt><dd>{t.warranty_end ? `${fmtDate(t.warranty_start)} → ${fmtDate(t.warranty_end)}` : 'Unknown'} <Badge status={t.warranty_status} /></dd>
                <dt>Fault code</dt><dd className="mono">{t.fault_code || '-'}</dd><dt>Details</dt><dd>{t.description || '-'}</dd><dt>Opened</dt><dd>{fmtDateTime(t.created_at)}</dd></dl></Card>
              <Card title="Parts & labour" pad={false}>
                {t.lines.length === 0 ? <div className="empty">None added</div> : <div className="table-wrap"><table>
                  <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">{t.billable ? 'Billed rate' : 'Rate'}</th><th className="num">Amount</th><th /></tr></thead>
                  <tbody>{t.lines.map((l) => <tr key={l.id}><td>{l.description}{l.is_labour && <span className="muted small"> (labour)</span>}</td><td className="num">{l.quantity}</td>
                    <td className="num">{t.billable ? money(l.unit_price) : <span className="muted"><s>{money(l.unit_price)}</s> free</span>}</td><td className="num">{money(l.quantity * l.billed_price, true)}</td>
                    <td className="right">{openish && <button className="btn sm secondary" onClick={async () => { await del(`/tickets/${t.id}/lines/${l.id}`); state.reload(); }}>✕</button>}</td></tr>)}</tbody>
                  <tfoot><tr><td colSpan={3} className="right"><b>{t.billable ? 'Billable (before GST)' : 'Charged to customer'}</b></td><td className="num"><b>{money(total, true)}</b></td><td /></tr>
                    {!t.billable && <tr><td colSpan={3} className="right muted">Warranty cost absorbed by SunPower</td><td className="num">{money(t.warrantyCost, true)}</td><td /></tr>}</tfoot>
                </table></div>}
              </Card>
              {t.resolution && <Card title="Resolution"><p style={{ marginTop: 0 }}>{t.resolution}</p>{t.replacement_serial && <p>Replacement unit: <span className="mono">{t.replacement_serial}</span></p>}
                {t.invoice && <p>Invoice <Link to={`/invoices/${t.invoice.id}`}>{t.invoice.invoice_no}</Link> · {money(t.invoice.total, true)} <Badge status={t.invoice.status} /></p>}
                {t.customer_confirmed_at && <p className="muted small">Customer confirmed on {fmtDateTime(t.customer_confirmed_at)}</p>}</Card>}
            </div>
            <Card title="Assignment">
              <p style={{ marginTop: 0 }}>Assigned to: <b>{t.assigned_name || 'Nobody yet'}</b></p>
              {support && openish && <Field label="Assign to"><select value={t.assigned_to || ''} onChange={async (e) => { if (e.target.value && await run(() => post(`/tickets/${id}/assign`, { userId: Number(e.target.value) }), 'Assigned')) state.reload(); }}>
                <option value="">Select…</option>{(staff.data || []).filter((u) => ['technician', 'support'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></Field>}
            </Card>
          </div>
          {modal === 'line' && <LineModal t={t} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'resolve' && <ResolveModal t={t} onClose={() => setModal(null)} onDone={done} />}
        </>
      );
    }}</Async>
  );
}
