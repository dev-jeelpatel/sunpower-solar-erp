import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, patch } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, fmtDate, label, money, useAction, useAsync, useForm } from '../components/ui';
import { Chips, Kpi, KpiRow, Person, Stepper, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
import { validate, required } from '../validators';
import * as V from '../validators';

const ORDER = ['documents_pending', 'submitted', 'approved', 'disbursed'];
/** Every status a file can be moved to from where it is now: stay, go forward, or reject. */
const optionsFor = (status: string) => (['disbursed', 'rejected'].includes(status) ? [] : [...ORDER.slice(ORDER.indexOf(status)), 'rejected']);
const NEXT: Record<string, string[]> = Object.fromEntries(ORDER.slice(0, 3).map((k) => [k, optionsFor(k)]));
const HELP: Record<string, string> = {
  documents_pending: "Still collecting the customer's papers",
  submitted: 'Filed on the government portal',
  approved: 'Subsidy approved, waiting for the payout',
  disbursed: 'Money has reached the customer',
  rejected: 'Application was turned down',
};
const today = () => new Date().toISOString().slice(0, 10);

function Update({ s, onClose, onDone }) {
  const opts = optionsFor(s.status);
  const f = useForm({ status: opts[1] || opts[0], referenceNo: s.reference_no || '', submittedAt: s.submitted_at ? String(s.submitted_at).slice(0, 10) : today(), approvedAmount: String(s.approved_amount ?? s.expected_amount ?? ''), notes: s.notes || '' });
  const { run, busy, error } = useAction(f.setErrors);
  const v = f.values;
  const needsRef = ['submitted', 'approved', 'disbursed'].includes(v.status);
  const needsAmount = ['approved', 'disbursed'].includes(v.status);
  const submit = async () => {
    const errs = validate(v, {
      referenceNo: needsRef ? [required('Portal reference number')] : [],
      approvedAmount: needsAmount ? [required('Approved amount')] : [],
      notes: v.status === 'rejected' ? [required('Reason for rejection')] : [],
    });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => patch(`/subsidies/${s.id}`, {
      status: v.status, referenceNo: v.referenceNo || undefined, notes: v.notes || undefined,
      submittedAt: needsRef ? v.submittedAt : undefined,
      approvedAmount: needsAmount ? Number(v.approvedAmount) : undefined,
    }), v.status === s.status ? 'Subsidy file saved' : `Moved to ${label(v.status)}`);
    if (ok) onDone();
  };
  return (
    <Modal title={`Subsidy · ${s.order_no}`} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className={`btn ${v.status === 'rejected' ? 'danger' : ''}`} disabled={busy} onClick={submit}>{v.status === s.status ? 'Save details' : v.status === 'rejected' ? 'Mark rejected' : 'Update'}</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <p className="muted" style={{ marginTop: 0 }}>{s.customer_name} · expected {money(s.expected_amount)} · now <b>{label(s.status)}</b></p>
      <div className="form-grid">
        <Field label="Status" hint={HELP[v.status]} className="full">
          <select {...f.bind('status')}>{opts.map((o) => <option key={o} value={o}>{o === s.status ? `${label(o)} (keep, edit details only)` : label(o)}</option>)}</select>
        </Field>
        {v.status !== 'documents_pending' && v.status !== 'rejected' && <>
          <Field label="Portal reference no." mask="text" required rules={[V.required('Portal reference number'), V.safeText('Reference number', 60)]} error={f.errors.referenceNo}><input {...f.bind('referenceNo')} /></Field>
          <Field label="Submitted on" error={f.errors.submittedAt}><input type="date" max={today()} {...f.bind('submittedAt')} /></Field>
        </>}
        {needsAmount && <Field label="Approved amount (₹)" mask="decimal" required rules={[V.required('Approved amount'), V.moneyAmount('Approved amount', 0, 100000000)]} error={f.errors.approvedAmount} className="full"><input type="number" inputMode="decimal" {...f.bind('approvedAmount')} /></Field>}
        <Field label={v.status === 'rejected' ? 'Reason for rejection' : 'Notes'} required={v.status === 'rejected'} mask="text" rules={[V.safeText('Notes', 500)]} error={f.errors.notes} className="full"><textarea rows={3} maxLength={500} {...f.bind('notes')} /></Field>
      </div>
    </Modal>
  );
}

const STEPS = ['documents_pending', 'submitted', 'approved', 'disbursed'];

export default function Subsidies() {
  const user = useCurrentUser();
  const state = useAsync(() => get('/subsidies'));
  const [edit, setEdit] = useState<any>(null);
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [scheme, setScheme] = useState('');
  return (
    <>
      <PageHead title="Subsidy tracker" sub="Government subsidy paperwork for each installation" />
      <Async state={state}>{(rows: any[]) => {
        if (rows.length === 0) return <Card><Empty>No subsidy files yet. They are created automatically for On-Grid orders that request a subsidy.</Empty></Card>;
        const open = rows.filter((r) => !['disbursed', 'rejected'].includes(r.status));
        const n = (s: string) => rows.filter((r) => r.status === s).length;
        const sumOf = (list: any[], f: (r: any) => number) => list.reduce((a, r) => a + Number(f(r) || 0), 0);
        const schemes = [...new Set(rows.map((r) => r.scheme).filter(Boolean))] as string[];
        const needle = q.trim().toLowerCase();
        const shown = rows
          .filter((r) => (!tab || r.status === tab) && (!scheme || r.scheme === scheme)
            && (!needle || [r.customer_name, r.order_no, r.reference_no].some((x) => String(x || '').toLowerCase().includes(needle))))
          .sort((a, b) => (sort === 'amount' ? Number(b.expected_amount) - Number(a.expected_amount) : sort === 'oldest' ? a.id - b.id : b.id - a.id));
        return (
          <div className="page-stack">
            <KpiRow>
              <Kpi icon="bank" tone="indigo" label="Files in progress" value={open.length} sub={`${n('documents_pending')} still need documents`} />
              <Kpi icon="wallet" tone="amber" label="Expected subsidy" value={money(sumOf(open, (r) => r.expected_amount))} sub="on open files" />
              <Kpi icon="check" tone="blue" label="Approved" value={money(sumOf(rows.filter((r) => r.status === 'approved'), (r) => r.approved_amount))} sub={`${n('approved')} files awaiting payout`} />
              <Kpi icon="trend" tone="green" label="Disbursed" value={money(sumOf(rows.filter((r) => r.status === 'disbursed'), (r) => r.approved_amount))} sub={`${n('disbursed')} files paid`} />
            </KpiRow>
            <Chips value={tab} onChange={setTab} options={[
              { value: '', label: 'All', count: rows.length },
              ...[...STEPS, 'rejected'].map((s) => ({ value: s, label: label(s), count: n(s) })),
            ]} />
            <div className="toolbar" style={{ margin: 0 }}>
              <input className="search" placeholder="Search customer, order or portal reference…" value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={tab} onChange={(e) => setTab(e.target.value)} aria-label="Status">
                <option value="">All statuses</option>
                {[...STEPS, 'rejected'].map((st) => <option key={st} value={st}>{label(st)} ({n(st)})</option>)}
              </select>
              {schemes.length > 1 && <select value={scheme} onChange={(e) => setScheme(e.target.value)} aria-label="Scheme"><option value="">All schemes</option>{schemes.map((sc) => <option key={sc}>{sc}</option>)}</select>}
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount">Largest subsidy first</option>
              </select>
            </div>
            <Card pad={false}>
              {shown.length === 0 ? <Empty>No files match.</Empty> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Customer</th><th>Progress</th><th>Reference</th><th>Submitted</th><th className="num">Expected</th><th className="num">Approved</th><th>Status</th><th /></tr></thead>
                  <tbody>{shown.map((s) => (
                    <tr key={s.id}>
                      <td><Person name={s.customer_name} sub={<Link to={`/orders/${s.order_id}`}>{s.order_no}</Link>} /></td>
                      <td>{s.status === 'rejected' ? <Tag tone="rose">Rejected</Tag> : <><Stepper steps={STEPS.map(label)} current={STEPS.indexOf(s.status)} /><span className="sub-line">{s.scheme}</span></>}</td>
                      <td>{s.reference_no ? <Tag tone="slate">{s.reference_no}</Tag> : <span className="muted">-</span>}</td>
                      <td className="nowrap">{fmtDate(s.submitted_at)}</td>
                      <td className="num"><span className="amt">{money(s.expected_amount)}</span></td>
                      <td className="num">{s.approved_amount != null ? <span className="amt good">{money(s.approved_amount)}</span> : <span className="muted">-</span>}</td>
                      <td><Badge status={s.status} /></td>
                      <td className="right">{can(user, 'sales') && NEXT[s.status] && <button className="btn sm secondary" onClick={() => setEdit(s)}>Update</button>}</td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </Card>
          </div>
        );
      }}</Async>
      {edit && <Update s={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); state.reload(); }} />}
    </>
  );
}
