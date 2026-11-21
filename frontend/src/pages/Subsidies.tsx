import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, patch } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, fmtDate, label, money, useAction, useAsync, useForm } from '../components/ui';
import { validate, required } from '../validators';

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
        <Field label="Portal reference no." error={f.errors.referenceNo}><input {...f.bind('referenceNo')} /></Field>
        {['approved', 'disbursed'].includes(v.status) && <Field label="Approved amount (₹)" error={f.errors.approvedAmount}><input type="number" {...f.bind('approvedAmount')} /></Field>}
        <Field label="Notes" className="full"><textarea {...f.bind('notes')} /></Field>
      </div>
    </Modal>
  );
}

export default function Subsidies() {
  const user = useCurrentUser();
  const state = useAsync(() => get('/subsidies'));
  const [edit, setEdit] = useState<any>(null);
  return (
    <>
      <PageHead title="Subsidy tracker" sub="Government subsidy paperwork for each installation" />
      <Card pad={false}>
        <Async state={state}>{(rows) => rows.length === 0 ? <Empty>No subsidy files yet. They are created automatically for On-Grid orders that request a subsidy.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Order</th><th>Customer</th><th>Scheme</th><th>Reference</th><th>Submitted</th><th className="num">Expected</th><th className="num">Approved</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((s) => <tr key={s.id}><td><Link to={`/orders/${s.order_id}`}>{s.order_no}</Link></td><td>{s.customer_name}</td><td className="small">{s.scheme}</td>
              <td className="mono">{s.reference_no || '-'}</td><td>{fmtDate(s.submitted_at)}</td><td className="num">{money(s.expected_amount)}</td><td className="num">{money(s.approved_amount)}</td><td><Badge status={s.status} /></td>
              <td className="right">{can(user, 'sales') && NEXT[s.status] && <button className="btn sm secondary" onClick={() => setEdit(s)}>Update</button>}</td></tr>)}</tbody>
          </table></div>)}</Async>
      </Card>
      {edit && <Update s={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); state.reload(); }} />}
    </>
  );
}
