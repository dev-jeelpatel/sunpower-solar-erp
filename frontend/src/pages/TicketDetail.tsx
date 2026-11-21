import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { del, get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Field, Modal, PageHead, Seg, fmtDate, fmtDateTime, label, money, useAction, useAsync, useForm } from '../components/ui';
import { validate, required, minLen, positive } from '../validators';
import * as V from '../validators';

type Row = { kind: 'part' | 'labour'; productId: string; description: string; quantity: string; unitPrice: string };
const blankRow = (): Row => ({ kind: 'part', productId: '', description: '', quantity: '1', unitPrice: '' });

/** Add several parts and labour lines in one go. */
function LineModal({ t, onClose, onDone }) {
  const prods = useAsync(() => get('/catalog/products'));
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [errs, setErrs] = useState<Record<number, Record<string, string>>>({});
  const [top, setTop] = useState('');
  const { run, busy, error } = useAction();
  const parts: any[] = (prods.data || []).filter((p) => p.category !== 'service' && !p.tracked_serial);

  const upd = (i: number, patch: Partial<Row>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    if (errs[i]) setErrs({ ...errs, [i]: {} });
  };
  const pick = (i: number, id: string) => {
    const p = parts.find((x) => String(x.product_id) === id);
    upd(i, { productId: id, unitPrice: p ? String(p.sell_price) : '' });
  };
  const lineTotal = (r: Row) => (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
  const total = rows.reduce((s, r) => s + lineTotal(r), 0);

  const submit = async () => {
    const all: Record<number, Record<string, string>> = {};
    rows.forEach((r, i) => {
      const e = validate(r, {
        quantity: [required('Quantity'), positive('Quantity'), V.range(0, 1000, 'Quantity')],
        unitPrice: [required('Rate'), V.moneyAmount('Rate', 0, 1000000)],
        ...(r.kind === 'part' ? { productId: [required('Part')] } : { description: [required('Description'), V.noMarkup('Description')] }),
      });
      if (Object.keys(e).length) all[i] = e;
    });
    const partIds = rows.filter((r) => r.kind === 'part' && r.productId).map((r) => r.productId);
    const dup = partIds.find((x, i) => partIds.indexOf(x) !== i);
    setErrs(all);
    setTop(dup ? 'The same part is on two lines. Combine them into one line with the total quantity.' : '');
    if (Object.keys(all).length || dup) return;
    const lines = rows.map((r) => ({
      productId: r.kind === 'part' ? Number(r.productId) : undefined,
      description: r.kind === 'labour' ? r.description : undefined,
      quantity: Number(r.quantity), unitPrice: Number(r.unitPrice), isLabour: r.kind === 'labour',
    }));
    const ok = await run(() => post(`/tickets/${t.id}/lines/batch`, { lines }), rows.length === 1 ? 'Line added' : `${rows.length} lines added`);
    if (ok) onDone();
  };

  return (
    <Modal title="Add parts and labour" wide onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Add {rows.length > 1 ? `${rows.length} lines` : 'line'}</button></>}>
      {(error || top) && <div className="alert bad" style={{ marginBottom: 12 }}>{top || error}</div>}
      <div className="stack">
        {rows.map((r, i) => {
          const e = errs[i] || {};
          return (
            <div key={i} className="tl-row">
              <div className="tl-head">
                <b>Line {i + 1}</b>
                <Seg value={r.kind} onChange={(k) => upd(i, { kind: k as Row['kind'], productId: '', description: '', unitPrice: '' })} options={[['part', 'Spare part'], ['labour', 'Labour / service']]} />
                {rows.length > 1 && <button type="button" className="btn secondary sm" onClick={() => { setRows(rows.filter((_, j) => j !== i)); setErrs({}); }} aria-label={`Remove line ${i + 1}`}>Remove</button>}
              </div>
              <div className="form-grid">
                {r.kind === 'part'
                  ? <Field label="Part from stock" error={e.productId} className="full"><select value={r.productId} onChange={(ev) => pick(i, ev.target.value)}><option value="">Select…</option>{parts.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} · {money(p.sell_price)} · {p.on_hand} in stock</option>)}</select></Field>
                  : <Field label="What is the charge for" rules={[V.noMarkup('Description')]} error={e.description} className="full"><input value={r.description} onChange={(ev) => upd(i, { description: ev.target.value })} placeholder="e.g. Site visit and diagnosis" maxLength={200} /></Field>}
                <Field label={r.kind === 'part' ? 'Quantity' : 'Hours or units'} rules={[V.required('Quantity'), V.positive('Quantity'), V.range(0, 1000, 'Quantity')]} error={e.quantity}><input type="number" step={r.kind === 'part' ? '1' : '0.5'} min="0" value={r.quantity} onChange={(ev) => upd(i, { quantity: ev.target.value })} /></Field>
                <Field label="Rate (₹)" mask="decimal" rules={[V.required('Rate'), V.moneyAmount('Rate', 0, 1000000)]} error={e.unitPrice}><input type="number" min="0" value={r.unitPrice} onChange={(ev) => upd(i, { unitPrice: ev.target.value })} /></Field>
              </div>
              <div className="tl-sum">Line total <b>{money(lineTotal(r), true)}</b></div>
            </div>
          );
        })}
        <div className="row between">
          <button type="button" className="btn secondary" onClick={() => { if (rows.length < 20) setRows([...rows, blankRow()]); }} disabled={rows.length >= 20}>+ Add another part or labour</button>
          <span className="muted">Total for {rows.length} line{rows.length === 1 ? '' : 's'}: <b>{money(total, true)}</b></span>
        </div>
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
        <Field label="What was done" mask="text" rules={[V.required('Resolution'), V.minLen(5, 'Resolution'), V.noMarkup('Resolution')]} error={f.errors.resolution}><textarea {...f.bind('resolution')} /></Field>
        {t.serial_no && <Field label="Replacement unit serial (if swapped)" mask="serial" rules={[V.serialNo]} error={f.errors.replacementSerial} hint="The faulty unit is marked faulty and the new unit gets a fresh warranty"><input className="mono" {...f.bind('replacementSerial')} onChange={(e) => f.set('replacementSerial', e.target.value.toUpperCase())} /></Field>}
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
