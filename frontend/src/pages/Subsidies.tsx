import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, patch } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, fmtDate, label, money, useAction, useAsync, useForm } from '../components/ui';
import { Chips, Kpi, KpiRow, Person, Stepper, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
import { validate, required } from '../validators';
import * as V from '../validators';

const NEXT = { documents_pending: ['submitted'], submitted: ['approved', 'rejected'], approved: ['disbursed'] };

function Update({ s, onClose, onDone }) {
  const next = NEXT[s.status] || [];
  const f = useForm({ status: next[0], referenceNo: s.reference_no || '', approvedAmount: s.approved_amount ?? s.expected_amount, notes: s.notes || '' });
  const { run, busy, error } = useAction(f.setErrors);
  const v = f.values;
  const submit = async () => {
    const errs = validate(v, { referenceNo: v.status === 'submitted' || v.status === 'approved' || v.status === 'disbursed' ? [required('Portal reference number')] : [] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => patch(`/subsidies/${s.id}`, { status: v.status, referenceNo: v.referenceNo, notes: v.notes, approvedAmount: ['approved', 'disbursed'].includes(v.status) ? Number(v.approvedAmount) : undefined }), 'Subsidy file updated');
    if (ok) onDone();
  };
  return (
    <Modal title={`Subsidy · ${s.order_no}`} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>Update</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Move to" className="full"><select {...f.bind('status')}>{next.map((n) => <option key={n} value={n}>{label(n)}</option>)}</select></Field>
        <Field label="Portal reference no." rules={[V.safeText('Reference number', 60)]} error={f.errors.referenceNo}><input {...f.bind('referenceNo')} /></Field>
        {['approved', 'disbursed'].includes(v.status) && <Field label="Approved amount (₹)" rules={[V.moneyAmount('Approved amount', 0, 100000000)]} error={f.errors.approvedAmount}><input type="number" {...f.bind('approvedAmount')} /></Field>}
        <Field label="Notes" rules={[V.safeText('Notes', 1000)]} className="full"><textarea {...f.bind('notes')} /></Field>
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
  return (
    <>
      <PageHead title="Subsidy tracker" sub="Government subsidy paperwork for each installation" />
      <Async state={state}>{(rows: any[]) => {
        if (rows.length === 0) return <Card><Empty>No subsidy files yet. They are created automatically for On-Grid orders that request a subsidy.</Empty></Card>;
        const open = rows.filter((r) => !['disbursed', 'rejected'].includes(r.status));
        const n = (s: string) => rows.filter((r) => r.status === s).length;
        const sumOf = (list: any[], f: (r: any) => number) => list.reduce((a, r) => a + Number(f(r) || 0), 0);
        const shown = tab ? rows.filter((r) => r.status === tab) : rows;
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
            <Card pad={false}>
              {shown.length === 0 ? <Empty>No files at this stage.</Empty> : (
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
