import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Icon, type IconName } from '../components/icons';
import { Avatar } from '../components/kit';
import { AssignModal } from './EnquiryDetail';
import { Badge, Card, Empty, Field, Loading, Modal, PageHead, Pager, label, fmtDate, useAction, useAsync, useDebounced, useForm, useToast, Async } from '../components/ui';
import { validate, required, personName, addressText, email, phone, normPhone, range } from '../validators';
import * as V from '../validators';

const STATUSES = ['new', 'contacted', 'qualified', 'survey_scheduled', 'survey_approved', 'quoted', 'won', 'lost'];

function NewEnquiry({ onClose, onDone, customer }: { onClose: () => void; onDone: () => void; customer?: any }) {
  const f = useForm({ name: customer?.name || '', phone: customer?.phone || '', email: customer?.email || '', address: customer?.address || '', city: customer?.city || '', requestedKw: '3', systemType: 'on_grid', source: 'call', subsidyRequired: false, message: '', assignedTo: '' });
  const admin = useCurrentUser().role === 'admin';
  const people = useAsync(() => (admin ? get('/enquiries/salespeople') : Promise.resolve([])), [admin]);
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const v = f.values;
    const errs = validate(v, { name: [required('Name'), personName('Name')], phone: [required('Phone'), phone], email: [email], address: [required('Address'), addressText('Address')], requestedKw: [range(1, 5, 'System size')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => post('/enquiries', { ...v, phone: normPhone(v.phone), requestedKw: Number(v.requestedKw), assignedTo: v.assignedTo ? Number(v.assignedTo) : undefined }), 'Enquiry added');
    if (ok) onDone();
  };
  return (
    <Modal title="New enquiry" onClose={onClose} wide footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Save enquiry</button></>}>
      {customer && <div className="alert info" style={{ marginBottom: 12 }}>Repeat enquiry for <b>{customer.name}</b>. Their details are filled in. Just choose what they want now.</div>}
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Name" mask="name" rules={[V.required('Name'), V.personName('Name')]} required error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Mobile" mask="phone" rules={[V.required('Mobile number'), V.phone]} required error={f.errors.phone}><input inputMode="tel" {...f.bind('phone')} /></Field>
        <Field label="Email" mask="email" rules={[V.email]} error={f.errors.email}><input type="email" {...f.bind('email')} /></Field>
        <Field label="City" mask="city" rules={[V.cityName]} error={f.errors.city}><input {...f.bind('city')} /></Field>
        <Field label="Address" mask="address" rules={[V.required('Address'), V.addressText('Address')]} required error={f.errors.address} className="full"><input {...f.bind('address')} /></Field>
        <Field label="Size (kW)" error={f.errors.requestedKw}><select {...f.bind('requestedKw')}>{[1, 2, 3, 4, 5].map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Type"><select {...f.bind('systemType')}><option value="on_grid">On-Grid</option><option value="off_grid">Off-Grid</option></select></Field>
        <Field label="Came in via"><select {...f.bind('source')}><option value="call">Phone call</option><option value="whatsapp">WhatsApp</option><option value="walk_in">Walk-in</option><option value="web">Web</option></select></Field>
        {admin && (
          <Field label="Assign to" hint="Left on automatic, the least busy salesperson gets it">
            <select {...f.bind('assignedTo')}>
              <option value="">Automatic{people.data?.[0] ? `: ${people.data[0].name} (least busy)` : ''}</option>
              {(people.data || []).map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.open} open</option>)}
            </select>
          </Field>
        )}
        <label className="check"><input type="checkbox" checked={f.values.subsidyRequired} onChange={(e) => f.set('subsidyRequired', e.target.checked)} /> Wants subsidy</label>
        <Field label="Notes" mask="text" rules={[V.safeText('Notes', 1000)]} className="full"><textarea {...f.bind('message')} /></Field>
      </div>
    </Modal>
  );
}

const STAGE_COLOR: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', qualified: '#0ea5e9', survey_scheduled: '#14b8a6',
  survey_approved: '#10b981', quoted: '#f59e0b', won: '#16a34a', lost: '#ef4444',
};
const SOURCE_ICON: Record<string, IconName> = { call: 'phone', whatsapp: 'chat', walk_in: 'walk', web: 'globe' };
const SOURCE_LABEL: Record<string, string> = { call: 'Phone call', whatsapp: 'WhatsApp', walk_in: 'Walk-in', web: 'Website' };

const initials = (name = '') => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** "3 days ago" style label; falls back to the date for anything older than a month. */
function ago(d: string) {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  return days < 31 ? `${days} day${days === 1 ? '' : 's'} ago` : fmtDate(d);
}

function CustomerCell({ e }: { e: any }) {
  return (
    <div className="cust">
      <Avatar name={e.customer_name} />
      <div><b>{e.customer_name}</b><small>{e.phone}</small></div>
    </div>
  );
}

function RequestCell({ e }: { e: any }) {
  return (
    <div className="req">
      <b>{e.requested_kw} kW</b>
      <span className={`tagx ${e.system_type === 'off_grid' ? 'amber' : 'blue'}`}>{e.system_type === 'off_grid' ? 'Off-grid' : 'On-grid'}</span>
      {e.subsidy_required && <span className="tagx green">Subsidy</span>}
    </div>
  );
}

function Board({ items, onOpen }: { items: any[]; onOpen: (id: number) => void }) {
  return (
    <div className="board">
      {STATUSES.map((s) => {
        const col = items.filter((e) => e.status === s);
        return (
          <section key={s} className="bcol">
            <header><i style={{ background: STAGE_COLOR[s] }} /><b>{label(s)}</b><span>{col.length}</span></header>
            <div className="bcards">
              {col.length === 0 && <div className="bempty">No leads</div>}
              {col.map((e) => (
                <button key={e.id} className="bcard" onClick={() => onOpen(e.id)}>
                  <div className="bcard-top"><b>{e.customer_name}</b><span className="muted small">{ago(e.created_at)}</span></div>
                  <div className="req"><b>{e.requested_kw} kW</b><span className={`tagx ${e.system_type === 'off_grid' ? 'amber' : 'blue'}`}>{e.system_type === 'off_grid' ? 'Off-grid' : 'On-grid'}</span>{e.subsidy_required && <span className="tagx green">Subsidy</span>}</div>
                  <div className="bcard-meta"><span><Icon n="pin" />{e.city || '-'}</span><span><Icon n={SOURCE_ICON[e.source] || 'inbox'} />{SOURCE_LABEL[e.source] || label(e.source)}</span></div>
                  {e.assigned_name && <div className="bcard-who"><Avatar name={e.assigned_name} mini role="sales" />{e.assigned_name}</div>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function Enquiries() {
  const user = useCurrentUser();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') || ''); // the dashboard funnel links here with ?status=
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [all, setAll] = useState(true); // salespeople see every enquiry by default; "Assigned to me" narrows it
  const [adding, setAdding] = useState(false);
  const [repeatFor, setRepeatFor] = useState<any>(null);
  const [assigning, setAssigning] = useState<any>(null); // admin: enquiry whose salesperson is being changed
  const newFor = params.get('newFor'); // the customer window links here to start a repeat enquiry
  useEffect(() => {
    if (!newFor) return;
    get(`/customers/${newFor}`).then((c) => { setRepeatFor(c); setAdding(true); }).catch(() => {}).finally(() => setParams({}, { replace: true }));
  }, [newFor]); // eslint-disable-line
  const [view, setView] = useState<'list' | 'board'>('list');
  const dq = useDebounced(q);
  const board = view === 'board';
  const state = useAsync(
    () => get(`/enquiries?page=${board ? 1 : page}&limit=${board ? 100 : 20}&status=${board ? '' : status}&q=${encodeURIComponent(dq)}${all ? '&all=1' : ''}`),
    [page, status, dq, all, view],
  );
  // Stage counts for the filter chips (company-wide, from the dashboard feed)
  const counts = useAsync(() => get('/reports/dashboard?period=month'), []);
  const byStage: Record<string, number> = Object.fromEntries((counts.data?.pipeline || []).map((p: any) => [p.status, p.n]));
  const totalAll = Object.values(byStage).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHead
        title="Enquiries"
        sub="Every lead from the web form, WhatsApp and calls in one place"
        actions={can(user, 'sales') && <button className="btn" onClick={() => { setRepeatFor(null); setAdding(true); }}><Icon n="plus" />New enquiry</button>}
      />

      <div className="chips" role="tablist" aria-label="Filter by stage">
        <button className={status === '' ? 'on' : ''} onClick={() => { setStatus(''); setPage(1); }}>All<span>{totalAll}</span></button>
        {STATUSES.map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => { setStatus(s); setPage(1); }} disabled={board}>
            <i style={{ background: STAGE_COLOR[s] }} />{label(s)}<span>{byStage[s] || 0}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search name, phone or city…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {user.role === 'sales' && (
          <div className="viewtog" role="group" aria-label="Whose enquiries">
            <button className={all ? 'on' : ''} onClick={() => { setAll(true); setPage(1); }}>Everyone</button>
            <button className={!all ? 'on' : ''} onClick={() => { setAll(false); setPage(1); }}>Assigned to me</button>
          </div>
        )}
        <div className="toolbar-sp" />
        <div className="viewtog" role="group" aria-label="View">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><Icon n="list" />List</button>
          <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}><Icon n="columns" />Board</button>
        </div>
      </div>

      <Async state={state}>{(d) => d.items.length === 0 ? (
        <Card><div className="empty"><span className="empty-ic"><Icon n="inbox" /></span><p>{dq || status ? 'No enquiries match these filters.' : 'No enquiries yet.'}</p>
          {(dq || status) && <button className="btn secondary sm" onClick={() => { setQ(''); setStatus(''); }}>Clear filters</button>}</div></Card>
      ) : board ? (
        <Board items={d.items} onOpen={(id) => nav(`/enquiries/${id}`)} />
      ) : (
        <Card pad={false}>
          <div className="table-wrap"><table>
            <thead><tr><th>Customer</th><th>Request</th><th>City</th><th>Source</th><th>Assigned to</th><th>Received</th><th>Status</th><th /></tr></thead>
            <tbody>{d.items.map((e: any) => (
              <tr key={e.id} className="clickable" onClick={() => nav(`/enquiries/${e.id}`)}>
                <td><CustomerCell e={e} /></td>
                <td><RequestCell e={e} /></td>
                <td><span className="ico-txt"><Icon n="pin" />{e.city || '-'}</span></td>
                <td><span className="src"><Icon n={SOURCE_ICON[e.source] || 'inbox'} />{SOURCE_LABEL[e.source] || label(e.source)}</span></td>
                <td>{user.role === 'admin'
                  ? <button type="button" className="assign-btn" title="Change who handles this enquiry" onClick={(ev) => { ev.stopPropagation(); setAssigning(e); }}>
                      {e.assigned_name ? <><Avatar name={e.assigned_name} mini role="sales" />{e.assigned_name}</> : <span className="muted">Unassigned</span>}<Icon n="chevD" />
                    </button>
                  : e.assigned_name ? <span className="who"><Avatar name={e.assigned_name} mini role="sales" />{e.assigned_name}</span> : <span className="muted">Unassigned</span>}</td>
                <td className="nowrap"><b className="soft">{ago(e.created_at)}</b><div className="muted small">{fmtDate(e.created_at)}</div></td>
                <td><Badge status={e.status} /></td>
                <td className="num"><a className="callbtn" href={`tel:${e.phone}`} onClick={(ev) => ev.stopPropagation()} title={`Call ${e.customer_name}`} aria-label={`Call ${e.customer_name}`}><Icon n="phone" /></a></td>
              </tr>))}</tbody>
          </table></div>
          <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />
        </Card>
      )}</Async>
      {assigning && <AssignModal e={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); state.reload(); }} />}
      {adding && <NewEnquiry customer={repeatFor} onClose={() => { setAdding(false); setRepeatFor(null); }} onDone={() => { setAdding(false); setRepeatFor(null); state.reload(); counts.reload(); }} />}
    </>
  );
}
