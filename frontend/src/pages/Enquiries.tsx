import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Badge, Card, Empty, Field, Loading, Modal, PageHead, Pager, label, fmtDate, useAction, useAsync, useDebounced, useForm, useToast, Async } from '../components/ui';
import { validate, required, minLen, email, phone, normPhone, range } from '../validators';

const STATUSES = ['new', 'contacted', 'qualified', 'survey_scheduled', 'survey_approved', 'quoted', 'won', 'lost'];

function NewEnquiry({ onClose, onDone }) {
  const f = useForm({ name: '', phone: '', email: '', address: '', city: '', requestedKw: '3', systemType: 'on_grid', source: 'call', subsidyRequired: false, message: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const v = f.values;
    const errs = validate(v, { name: [required('Name'), minLen(2, 'Name')], phone: [required('Phone'), phone], email: [email], address: [required('Address'), minLen(8, 'Address')], requestedKw: [range(1, 5, 'System size')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => post('/enquiries', { ...v, phone: normPhone(v.phone), requestedKw: Number(v.requestedKw) }), 'Enquiry added');
    if (ok) onDone();
  };
  return (
    <Modal title="New enquiry" onClose={onClose} wide footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Save enquiry</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Name" required error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Mobile" required error={f.errors.phone}><input inputMode="tel" {...f.bind('phone')} /></Field>
        <Field label="Email" error={f.errors.email}><input type="email" {...f.bind('email')} /></Field>
        <Field label="City" error={f.errors.city}><input {...f.bind('city')} /></Field>
        <Field label="Address" required error={f.errors.address} className="full"><input {...f.bind('address')} /></Field>
        <Field label="Size (kW)" error={f.errors.requestedKw}><select {...f.bind('requestedKw')}>{[1, 2, 3, 4, 5].map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Type"><select {...f.bind('systemType')}><option value="on_grid">On-Grid</option><option value="off_grid">Off-Grid</option></select></Field>
        <Field label="Came in via"><select {...f.bind('source')}><option value="call">Phone call</option><option value="whatsapp">WhatsApp</option><option value="walk_in">Walk-in</option><option value="web">Web</option></select></Field>
        <label className="check"><input type="checkbox" checked={f.values.subsidyRequired} onChange={(e) => f.set('subsidyRequired', e.target.checked)} /> Wants subsidy</label>
        <Field label="Notes" className="full"><textarea {...f.bind('message')} /></Field>
      </div>
    </Modal>
  );
}

export default function Enquiries() {
  const user = useCurrentUser();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q);
  const state = useAsync(() => get(`/enquiries?page=${page}&status=${status}&q=${encodeURIComponent(dq)}${all ? '&all=1' : ''}`), [page, status, dq, all]);

  return (
    <>
      <PageHead title="Enquiries" sub="Every lead from the web form, WhatsApp and calls in one place" actions={can(user, 'sales') && <button className="btn" onClick={() => setAdding(true)}>+ New enquiry</button>} />
      <div className="toolbar">
        <input className="search" placeholder="Search name, phone or city…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        {user.role === 'sales' && <label className="check"><input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); setPage(1); }} /> Show everyone's</label>}
      </div>
      <Card pad={false}>
        <Async state={state}>{(d) => d.items.length === 0 ? <Empty>No enquiries match.</Empty> : (
          <>
            <div className="table-wrap"><table>
              <thead><tr><th>Customer</th><th>Request</th><th>City</th><th>Source</th><th>Assigned to</th><th>Received</th><th>Status</th></tr></thead>
              <tbody>{d.items.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => nav(`/enquiries/${e.id}`)}>
                  <td><b>{e.customer_name}</b><div className="muted small">{e.phone}</div></td>
                  <td>{e.requested_kw} kW {label(e.system_type)}{e.subsidy_required && ' · subsidy'}</td><td>{e.city || '-'}</td><td className="muted">{label(e.source)}</td>
                  <td>{e.assigned_name || '-'}</td><td className="nowrap">{fmtDate(e.created_at)}</td><td><Badge status={e.status} /></td>
                </tr>))}</tbody>
            </table></div>
            <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />
          </>
        )}</Async>
      </Card>
      {adding && <NewEnquiry onClose={() => setAdding(false)} onDone={() => { setAdding(false); state.reload(); }} />}
    </>
  );
}
