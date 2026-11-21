import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, Pager, fmtDate, label, useAction, useAsync, useDebounced, useForm } from '../components/ui';
import { validate, required, minLen } from '../validators';

function NewTicket({ onClose, initialSerial = '' }) {
  const nav = useNavigate();
  const f = useForm({ serial: initialSerial, subject: '', faultCode: '', priority: 'normal', description: '' });
  const [found, setFound] = useState<any>(null);
  const [lookupErr, setLookupErr] = useState('');
  const { run, busy, error } = useAction(f.setErrors);

  const check = async () => {
    const s = f.values.serial.trim();
    if (!s) return;
    setLookupErr(''); setFound(null);
    try { setFound(await get(`/inventory/units/lookup/${encodeURIComponent(s)}`)); } catch (e) { setLookupErr(e.message); }
  };
  const submit = async () => {
    const errs = validate(f.values, { serial: [required('Serial number')], subject: [required('Subject'), minLen(5, 'Subject')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = await run(() => post('/tickets', { ...f.values }), 'Ticket created');
    if (r?.id) nav(`/tickets/${r.id}`);
  };
  return (
    <Modal title="New service ticket" onClose={onClose} wide footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Create ticket</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Inverter / battery serial number" required error={f.errors.serial || lookupErr} className="full" hint="Found on the unit label. We find the customer and warranty automatically.">
          <div className="row" style={{ flexWrap: 'nowrap' }}><input className="mono" value={f.values.serial} onChange={(e) => { f.set('serial', e.target.value.toUpperCase()); setFound(null); }} onBlur={check} /><button type="button" className="btn secondary" onClick={check}>Look up</button></div>
        </Field>
        {found && <div className={`alert ${found.warranty_state === 'in_warranty' ? 'ok' : 'warn'} full`}>
          <b>{found.product_name}</b> · {found.customer_name || 'not delivered'} · {found.warranty_state === 'in_warranty' ? `In warranty until ${fmtDate(found.warranty_end)}: repair is free` : found.warranty_state === 'expired' ? `Warranty expired ${fmtDate(found.warranty_end)}: repair will be billed` : 'Warranty not started'}</div>}
        <Field label="Problem summary" required error={f.errors.subject} className="full"><input {...f.bind('subject')} placeholder="e.g. Inverter shows fault E04, no power" /></Field>
        <Field label="Fault code" error={f.errors.faultCode}><input {...f.bind('faultCode')} /></Field>
        <Field label="Priority"><select {...f.bind('priority')}>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Details" className="full"><textarea {...f.bind('description')} /></Field>
      </div>
    </Modal>
  );
}

export default function Tickets() {
  const user = useCurrentUser();
  const nav = useNavigate();
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q);
  const state = useAsync(() => get(`/tickets?page=${page}&status=${status}&q=${encodeURIComponent(dq)}`), [page, status, dq]);
  return (
    <>
      <PageHead title="Service tickets" sub="Every complaint is tracked until the customer confirms it works" actions={can(user, 'support') && <button className="btn" onClick={() => setAdding(true)}>+ New ticket</button>} />
      <div className="toolbar">
        <input className="search" placeholder="Search ticket, customer, phone or serial…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="active">Not closed</option><option value="">All</option>{['open', 'assigned', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
      </div>
      <Card pad={false}><Async state={state}>{(d) => d.items.length === 0 ? <Empty>No tickets 🎉</Empty> : (
        <><div className="table-wrap"><table>
          <thead><tr><th>Ticket</th><th>Customer</th><th>Issue</th><th>Serial</th><th>Priority</th><th>Warranty</th><th>Assigned</th><th>Opened</th><th>Status</th></tr></thead>
          <tbody>{d.items.map((t) => <tr key={t.id} className="clickable" onClick={() => nav(`/tickets/${t.id}`)}>
            <td><b>{t.ticket_no}</b></td><td>{t.customer_name}</td><td>{t.subject}</td><td className="mono small">{t.serial_no || '-'}</td><td><Badge status={t.priority} /></td><td><Badge status={t.warranty_status} /></td>
            <td>{t.assigned_name || '-'}</td><td>{fmtDate(t.created_at)}</td><td><Badge status={t.status} /></td></tr>)}</tbody>
        </table></div><Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} /></>)}</Async></Card>
      {adding && <NewTicket onClose={() => { setAdding(false); state.reload(); }} />}
    </>
  );
}
export { NewTicket };
