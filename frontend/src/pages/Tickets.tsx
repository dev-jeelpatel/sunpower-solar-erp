import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, Pager, fmtDate, label, useAction, useAsync, useDebounced, useForm } from '../components/ui';
import { Avatar, Chips, Kpi, KpiRow, Person, Tag, ago } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
import { validate, required, minLen } from '../validators';
import * as V from '../validators';

/**
 * Raise a service ticket. Staff can find the customer by mobile number and pick the faulty item from
 * everything that customer owns, or (as before) start from a serial number.
 */
function NewTicket({ onClose, initialSerial = '' }: { onClose: () => void; initialSerial?: string }) {
  const nav = useNavigate();
  const [mode, setMode] = useState<'mobile' | 'serial'>(initialSerial ? 'serial' : 'mobile');
  const f = useForm({ serial: initialSerial, subject: '', faultCode: '', priority: 'normal', description: '' });
  const { run, busy, error } = useAction(f.setErrors);

  // ----- serial-number mode -----
  const [found, setFound] = useState<any>(null);
  const [lookupErr, setLookupErr] = useState('');
  const check = async () => {
    const s = f.values.serial.trim();
    if (!s) return;
    setLookupErr(''); setFound(null);
    try { setFound(await get(`/inventory/units/lookup/${encodeURIComponent(s)}`)); } catch (e) { setLookupErr(e.message); }
  };

  // ----- mobile-number mode -----
  const [phone, setPhone] = useState('');
  const [cust, setCust] = useState<any>(null); // customer detail incl. units
  const [phoneErr, setPhoneErr] = useState('');
  const [looking, setLooking] = useState(false);
  const [picked, setPicked] = useState(''); // serial of the faulty item; '' = not about one specific item
  const lastLooked = useRef('');
  const digits = phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  const phoneOk = /^[6-9]\d{9}$/.test(digits);

  const findCustomer = async (num = digits) => {
    if (!/^[6-9]\d{9}$/.test(num)) { setPhoneErr('Enter a valid 10-digit mobile number'); return; }
    lastLooked.current = num;
    setLooking(true); setPhoneErr(''); setCust(null); setPicked('');
    try {
      const s = await get(`/search?q=${num}`);
      const c = (s.customers || []).find((x: any) => String(x.phone) === num);
      if (!c) { setPhoneErr('No customer is registered with this number'); return; }
      const detail = await get(`/customers/${c.id}`);
      setCust(detail);
      if (detail.units.length === 1) setPicked(detail.units[0].serial_no);
    } catch (e) { setPhoneErr(e.message); } finally { setLooking(false); }
  };
  const onPhone = (v: string) => {
    setPhone(v);
    const d = v.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (/^[6-9]\d{9}$/.test(d) && d !== lastLooked.current) findCustomer(d); // search as soon as the number is complete
    if (d !== lastLooked.current) { setCust(null); setPicked(''); }
  };

  const submit = async () => {
    const rules: Record<string, any[]> = { subject: [required('Subject'), minLen(5, 'Subject')] };
    if (mode === 'serial') rules.serial = [required('Serial number')];
    const errs = validate(f.values, rules);
    if (mode === 'mobile' && !cust) errs.phone = 'Find the customer by mobile number first';
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = mode === 'serial'
      ? { ...f.values }
      : { ...f.values, serial: picked || undefined, customerId: picked ? undefined : cust.id };
    const r = await run(() => post('/tickets', body), 'Ticket created');
    if (r?.id) nav(`/tickets/${r.id}`);
  };

  return (
    <Modal title="New service ticket" onClose={onClose} wide footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Create ticket</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <div className="full">
          <div className="viewtog" role="group" aria-label="Find the customer by">
            <button type="button" className={mode === 'mobile' ? 'on' : ''} onClick={() => setMode('mobile')}><Icon n="phone" />Mobile number</button>
            <button type="button" className={mode === 'serial' ? 'on' : ''} onClick={() => setMode('serial')}><Icon n="search" />Serial number</button>
          </div>
        </div>

        {mode === 'mobile' ? (
          <>
            <Field label="Customer's mobile number" mask="phone" rules={[V.required('Mobile number'), V.phone]} required error={phoneErr || f.errors.phone} className="full" hint="We find the customer and list the equipment they own.">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input inputMode="tel" autoFocus placeholder="98765 43210" value={phone} onChange={(e) => onPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findCustomer(); } }} />
                <button type="button" className="btn secondary" disabled={looking || !phoneOk} onClick={() => findCustomer()}>{looking ? 'Searching…' : 'Find customer'}</button>
              </div>
            </Field>
            {cust && (
              <div className="full tk-cust">
                <Person name={cust.name} sub={`${cust.phone}${cust.city ? ` · ${cust.city}` : ''}`} />
                <div className="tk-pick-title">Which item has the problem?</div>
                <div className="pickrows" role="radiogroup" aria-label="Equipment">
                  {cust.units.map((u: any) => (
                    <label key={u.serial_no} className={`pickrow ${picked === u.serial_no ? 'on' : ''}`}>
                      <input type="radio" name="unit" checked={picked === u.serial_no} onChange={() => setPicked(u.serial_no)} />
                      <span className="pk-main"><b>{u.name}</b><small className="mono">{u.serial_no}</small></span>
                      <span className="pk-state">
                        <Badge status={u.warranty_state} />
                        <small>{u.warranty_state === 'in_warranty' ? `until ${fmtDate(u.warranty_end)}` : u.warranty_state === 'expired' ? `ended ${fmtDate(u.warranty_end)}` : ''}</small>
                      </span>
                    </label>
                  ))}
                  <label className={`pickrow ${picked === '' ? 'on' : ''}`}>
                    <input type="radio" name="unit" checked={picked === ''} onChange={() => setPicked('')} />
                    <span className="pk-main"><b>Something else</b><small>Not about one specific item. Warranty will be treated as unknown.</small></span>
                  </label>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <Field label="Inverter / battery serial number" mask="serial" rules={[V.serialNo]} required error={f.errors.serial || lookupErr} className="full" hint="Found on the unit label. We find the customer and warranty automatically.">
              <div className="row" style={{ flexWrap: 'nowrap' }}><input className="mono" value={f.values.serial} onChange={(e) => { f.set('serial', e.target.value.toUpperCase()); setFound(null); }} onBlur={check} /><button type="button" className="btn secondary" onClick={check}>Look up</button></div>
            </Field>
            {found && <div className={`alert ${found.warranty_state === 'in_warranty' ? 'ok' : 'warn'} full`}>
              <b>{found.product_name}</b> · {found.customer_name || 'not delivered'} · {found.warranty_state === 'in_warranty' ? `In warranty until ${fmtDate(found.warranty_end)}: repair is free` : found.warranty_state === 'expired' ? `Warranty expired ${fmtDate(found.warranty_end)}: repair will be billed` : 'Warranty not started'}</div>}
          </>
        )}

        <Field label="Problem summary" mask="text" rules={[V.required('Summary'), V.minLen(5, 'Summary'), V.noMarkup('Summary')]} required error={f.errors.subject} className="full"><input {...f.bind('subject')} placeholder="e.g. Inverter shows fault E04, no power" /></Field>
        <Field label="Fault code" error={f.errors.faultCode}><input {...f.bind('faultCode')} /></Field>
        <Field label="Priority"><select {...f.bind('priority')}>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Details" mask="text" rules={[V.safeText('Details', 1000)]} className="full"><textarea {...f.bind('description')} /></Field>
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
                <td>{t.assigned_name ? <span className="who"><Avatar name={t.assigned_name} mini role="staff" />{t.assigned_name}</span> : <span className="muted">Unassigned</span>}</td>
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
