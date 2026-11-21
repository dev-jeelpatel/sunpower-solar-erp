import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, Pager, fmtDate, label, useAction, useAsync, useDebounced, useForm } from '../components/ui';
import { Chips, Kpi, KpiRow, Person, Tag, ago } from '../components/kit';
import { Icon } from '../components/icons';
import { validate } from '../validators';
import * as V from '../validators';

export const CLAIM_STEPS = [
  { key: 'filed', label: 'Claim filed' },
  { key: 'inspecting', label: 'Inspection booked' },
  { key: 'inspected', label: 'Inspected' },
  { key: 'approved', label: 'Approved' },
  { key: 'fulfilled', label: 'Repaired / replaced' },
  { key: 'closed', label: 'Closed' },
];
export const CLAIM_TONE: Record<string, any> = {
  filed: 'amber', inspecting: 'blue', inspected: 'violet', approved: 'green', fulfilled: 'blue', closed: 'slate', rejected: 'rose', withdrawn: 'slate',
};
export const CLAIM_LABEL: Record<string, string> = {
  filed: 'Filed', inspecting: 'Inspection booked', inspected: 'Awaiting decision', approved: 'Approved', fulfilled: 'Awaiting customer', closed: 'Closed', rejected: 'Rejected', withdrawn: 'Withdrawn',
};

/** File a claim: the serial number decides the customer and whether the warranty is still valid. */
export function FileClaim({ initialSerial = '', onClose }: { initialSerial?: string; onClose: () => void }) {
  const nav = useNavigate();
  const f = useForm({ serial: initialSerial, issue: '', faultCode: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const [unit, setUnit] = useState<any>(null);
  const [looked, setLooked] = useState('');
  const check = async (s: string) => {
    const serial = s.trim().toUpperCase();
    if (!serial || V.serialNo(serial)) { setUnit(null); setLooked(''); return; }
    try { setUnit(await get(`/inventory/units/lookup/${encodeURIComponent(serial)}`)); setLooked(''); } catch (e) { setUnit(null); setLooked(e.message); }
  };
  const submit = async () => {
    const errs = validate(f.values, { serial: [V.required('Serial number'), V.serialNo], issue: [V.required('Description'), V.minLen(10, 'Description'), V.noMarkup('Description')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = await run(() => post('/claims', { serial: f.values.serial.trim().toUpperCase(), issue: f.values.issue, faultCode: f.values.faultCode || undefined }), 'Claim filed');
    if (r?.id) nav(`/claims/${r.id}`);
  };
  const expired = unit && unit.warranty_state !== 'in_warranty';
  return (
    <Modal title="File a warranty claim" wide onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>File claim</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">
        <Field label="Serial number of the faulty unit" required error={f.errors.serial || (looked ? looked : undefined)} rules={[V.required('Serial number'), V.serialNo]} hint="Printed on the panel, inverter or battery, e.g. INV3-001">
          <input className="mono" value={f.values.serial} autoFocus onChange={(e) => f.set('serial', e.target.value.toUpperCase())} onBlur={(e) => check(e.target.value)} />
        </Field>
        {unit && (
          <div className={`claim-elig ${expired ? 'bad' : 'ok'}`}>
            <b>{unit.product_name}</b> · {unit.customer_name || 'not delivered'}
            <span>{unit.warranty_state === 'in_warranty' ? `Under warranty until ${fmtDate(unit.warranty_end)} (${unit.days_left} days left)` : unit.warranty_state === 'expired' ? `Warranty ended on ${fmtDate(unit.warranty_end)}. The claim can only be approved as goodwill by an admin.` : 'Warranty has not started'}</span>
          </div>
        )}
        <Field label="What is wrong?" required error={f.errors.issue} rules={[V.required('Description'), V.minLen(10, 'Description'), V.noMarkup('Description')]} hint="Describe what the customer sees and when it started (at least 10 characters)">
          <textarea rows={4} maxLength={1500} value={f.values.issue} onChange={(e) => f.set('issue', e.target.value)} />
        </Field>
        <Field label="Fault code on the display (if any)" error={f.errors.faultCode}><input value={f.values.faultCode} maxLength={30} onChange={(e) => f.set('faultCode', e.target.value)} placeholder="e.g. E04" /></Field>
      </div>
    </Modal>
  );
}

export default function Claims() {
  const user = useCurrentUser();
  const nav = useNavigate();
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [filing, setFiling] = useState(false);
  const dq = useDebounced(q);
  const stats = useAsync(() => get('/claims/stats'));
  const state = useAsync(() => get(`/claims?page=${page}&status=${status}&q=${encodeURIComponent(dq)}`), [page, status, dq]);
  const s = stats.data || {};
  const tech = user.role === 'technician';
  return (
    <>
      <PageHead title="Warranty claims" sub={tech ? 'Inspections assigned to you' : 'File, inspect, decide and fulfil: every claim is tracked until the customer confirms'}
        actions={can(user, 'support') && <button className="btn" onClick={() => setFiling(true)}><Icon n="plus" />File a claim</button>} />
      <div className="page-stack">
        {!tech && (
          <KpiRow>
            <Kpi icon="clock" tone="amber" label="New" value={s.filed ?? 0} sub="waiting for an inspection" />
            <Kpi icon="wrench" tone="blue" label="Being inspected" value={s.inspecting ?? 0} sub="technician is booked" />
            <Kpi icon="shield" tone={s.to_decide ? 'violet' : 'green'} label="Needs a decision" value={s.to_decide ?? 0} sub="inspected, approve or reject" />
            <Kpi icon="truck" tone="indigo" label="To repair or replace" value={(s.to_fulfil ?? 0) + (s.to_close ?? 0)} sub={`${s.to_fulfil ?? 0} to do, ${s.to_close ?? 0} awaiting customer`} />
          </KpiRow>
        )}
        <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { value: 'active', label: 'Open claims' }, { value: 'inspected', label: 'Needs a decision', count: s.to_decide }, { value: 'approved', label: 'Approved' },
          { value: 'fulfilled', label: 'Awaiting customer' }, { value: 'closed', label: 'Closed' }, { value: 'rejected', label: 'Rejected' }, { value: '', label: 'All' }]} />
        <div className="toolbar" style={{ margin: 0 }}><input className="search" placeholder="Search claim number, customer, phone or serial…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <Card pad={false}>
          <Async state={state}>{(d: any) => d.items.length === 0 ? <Empty>{status === 'active' ? 'No open warranty claims.' : 'No claims match.'}</Empty> : (
            <>
              <div className="table-wrap"><table>
                <thead><tr><th>Claim</th><th>Customer</th><th>Item</th><th>Warranty</th><th>Inspector</th><th>Status</th></tr></thead>
                <tbody>{d.items.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => nav(`/claims/${c.id}`)}>
                    <td><b>{c.claim_no}</b><span className="sub-line">{ago(c.filed_at)}</span></td>
                    <td><Person name={c.customer_name} sub={c.phone} /></td>
                    <td><b className="soft">{c.product_name}</b><span className="sub-line mono">{c.serial_no}</span></td>
                    <td>{c.goodwill ? <Tag tone="violet">Goodwill</Tag> : c.covered ? <Tag tone="green">In warranty</Tag> : <Tag tone="rose">Warranty ended</Tag>}</td>
                    <td>{c.technician_name ? <>{c.technician_name}<span className="sub-line">{fmtDate(c.inspection_date)}</span></> : <span className="muted">Not booked</span>}</td>
                    <td><Tag tone={CLAIM_TONE[c.status]}>{CLAIM_LABEL[c.status] || label(c.status)}</Tag></td>
                  </tr>))}</tbody>
              </table></div>
              <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />
            </>
          )}</Async>
        </Card>
      </div>
      {filing && <FileClaim onClose={() => setFiling(false)} />}
    </>
  );
}
