import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, Pager, fmtDate, label, useAction, useAsync, useDebounced, useForm } from '../components/ui';
import { Avatar, Chips, Kpi, KpiRow, Person, Tag, ago } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
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

const PRIORITY_TONE: Record<string, 'rose' | 'amber' | 'blue' | 'slate'> = { urgent: 'rose', high: 'amber', normal: 'blue', low: 'slate' };

export default function Tickets() {
  const user = useCurrentUser();
  const nav = useNavigate();
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q);
  const state = useAsync(() => get(`/tickets?page=${page}&status=${status}&q=${encodeURIComponent(dq)}`), [page, status, dq]);
  // Summary and chip counts come from the latest 100 tickets
  const all = useAsync(() => get('/tickets?limit=100&status='), []);
  const items: any[] = all.data?.items || [];
  const cnt = (s: string) => items.filter((t) => t.status === s).length;
  const active = items.filter((t) => t.status !== 'closed');
  const hot = active.filter((t) => ['urgent', 'high'].includes(t.priority) && ['open', 'assigned'].includes(t.status)).length;
  return (
    <>
      <PageHead title="Service tickets" sub="Every complaint is tracked until the customer confirms it works" actions={can(user, 'support') && <button className="btn" onClick={() => setAdding(true)}><Icon n="plus" />New ticket</button>} />
      <div className="page-stack">
        <KpiRow>
          <Kpi icon="ticket" tone="indigo" label="Open" value={cnt('open')} sub="not assigned yet" />
          <Kpi icon="wrench" tone="blue" label="Being handled" value={cnt('assigned')} sub="assigned to someone" />
          <Kpi icon="alert" tone={hot ? 'rose' : 'green'} label="High priority" value={hot} sub={hot ? 'open or assigned, needs care' : 'nothing urgent'} />
          <Kpi icon="check" tone="green" label="Awaiting confirmation" value={cnt('resolved')} sub="fixed, customer to confirm" />
        </KpiRow>
        <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { value: 'active', label: 'Not closed', count: active.length },
          ...['open', 'assigned', 'resolved', 'closed'].map((s) => ({ value: s, label: label(s), count: cnt(s) })),
          { value: '', label: 'All', count: items.length },
        ]} />
        <div className="toolbar" style={{ margin: 0 }}>
          <input className="search" placeholder="Search ticket, customer, phone or serial…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <Card pad={false}><Async state={state}>{(d) => d.items.length === 0 ? <Empty>No tickets here. Nice work!</Empty> : (
          <><div className="table-wrap"><table>
            <thead><tr><th>Ticket</th><th>Customer</th><th>Issue</th><th>Priority</th><th>Warranty</th><th>Assigned</th><th>Status</th><th /></tr></thead>
            <tbody>{d.items.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => nav(`/tickets/${t.id}`)}>
                <td><b>{t.ticket_no}</b><span className="sub-line">{ago(t.created_at)}</span></td>
                <td><Person name={t.customer_name} /></td>
                <td style={{ maxWidth: 260 }}><b className="soft">{t.subject}</b>{t.serial_no && <span className="sub-line"><span className="mono">{t.serial_no}</span></span>}</td>
                <td><Tag tone={PRIORITY_TONE[t.priority] || 'slate'}>{label(t.priority)}</Tag></td>
                <td>{t.warranty_status === 'in_warranty' ? <Tag tone="green">In warranty · free</Tag> : t.warranty_status === 'out_of_warranty' ? <Tag tone="rose">Out of warranty · billable</Tag> : <Tag>Unknown</Tag>}</td>
                <td>{t.assigned_name ? <span className="who"><Avatar name={t.assigned_name} mini />{t.assigned_name}</span> : <span className="muted">Unassigned</span>}</td>
                <td><Badge status={t.status} /></td>
                <td className="row-go"><Icon n="arrow" /></td>
              </tr>))}</tbody>
          </table></div><Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} /></>)}</Async></Card>
      </div>
      {adding && <NewTicket onClose={() => { setAdding(false); state.reload(); all.reload(); }} />}
    </>
  );
}
export { NewTicket };
