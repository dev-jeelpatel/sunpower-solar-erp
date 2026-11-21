import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Icon, type IconName } from '../components/icons';
import { Avatar } from '../components/kit';
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
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [all, setAll] = useState(true); // salespeople see every enquiry by default; "Assigned to me" narrows it
  const [adding, setAdding] = useState(false);
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
        actions={can(user, 'sales') && <button className="btn" onClick={() => setAdding(true)}><Icon n="plus" />New enquiry</button>}
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
                <td>{e.assigned_name ? <span className="who"><Avatar name={e.assigned_name} mini role="sales" />{e.assigned_name}</span> : <span className="muted">Unassigned</span>}</td>
                <td className="nowrap"><b className="soft">{ago(e.created_at)}</b><div className="muted small">{fmtDate(e.created_at)}</div></td>
                <td><Badge status={e.status} /></td>
                <td className="num"><a className="callbtn" href={`tel:${e.phone}`} onClick={(ev) => ev.stopPropagation()} title={`Call ${e.customer_name}`} aria-label={`Call ${e.customer_name}`}><Icon n="phone" /></a></td>
              </tr>))}</tbody>
          </table></div>
          <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />
        </Card>
      )}</Async>
      {adding && <NewEnquiry onClose={() => setAdding(false)} onDone={() => { setAdding(false); state.reload(); counts.reload(); }} />}
    </>
  );
}
