import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Confirm, Field, Modal, PageHead, Seg, fmtDate, fmtDateTime, label, money, useAction, useAsync, useForm } from '../components/ui';
import { Tracker } from '../components/kit';
import TechPicker from '../components/TechPicker';
import { CLAIM_LABEL, CLAIM_STEPS } from './Claims';
import { validate } from '../validators';
import * as V from '../validators';

const CAUSE: Record<string, string> = {
  manufacturing_defect: 'Manufacturing defect', installation_fault: 'Installation fault', wear_and_tear: 'Normal wear and tear',
  physical_damage: 'Physical damage', misuse: 'Misuse', power_surge: 'Power surge', other: 'Other',
};
const NEXT: Record<string, string> = {
  filed: 'Book a technician to inspect the unit.',
  inspecting: 'The technician visits and submits an inspection report.',
  inspected: 'Read the report, then approve (repair or replace) or reject with a reason.',
  approved: 'Repair the unit or hand over a replacement.',
  fulfilled: 'Wait for the customer to confirm it works, then close the claim.',
};
const TIMELINE: Record<string, string> = {
  filed: 'Claim filed', inspection_booked: 'Inspection booked', inspected: 'Inspection report submitted', approved: 'Approved', approved_goodwill: 'Approved as goodwill',
  rejected: 'Rejected', replaced: 'Replacement handed over', repaired: 'Repair recorded', supplier_sent: 'Faulty unit sent to the supplier',
  supplier_credited: 'Supplier credit received', closed: 'Closed after customer confirmation', withdrawn: 'Withdrawn',
};

function Assign({ c, onClose, onDone }) {
  const f = useForm({ tech: c.technician_id ? String(c.technician_id) : '', date: c.inspection_date || new Date(Date.now() + 864e5).toISOString().slice(0, 10) });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    if (!f.values.tech) return f.setErrors({ technicianId: 'Choose an available technician' });
    if (await run(() => post(`/claims/${c.id}/assign`, { technicianId: Number(f.values.tech), visitDate: f.values.date }), 'Inspection booked')) onDone();
  };
  return (
    <Modal title="Book the inspection" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy || !f.values.tech}>Book inspection</button></>}>
      <div className="stack">
        {error && <div className="alert bad">{error}</div>}
        <Field label="Visit date" error={f.errors.visitDate}><input type="date" min={new Date().toISOString().slice(0, 10)} {...f.bind('date')} /></Field>
        <Field label="Technician (only free ones can be chosen)" error={f.errors.technicianId}>
          <TechPicker date={f.values.date} value={f.values.tech} onChange={(id) => f.set('tech', id)} onPickDate={(d) => f.set('date', d)} excludeClaimId={c.id} current={c.technician_name ? [c.technician_name] : []} />
        </Field>
      </div>
    </Modal>
  );
}

function Inspect({ c, onClose, onDone }) {
  const f = useForm({ findings: '', cause: '', recommendation: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const errs = validate(f.values, { findings: [V.required('Findings'), V.minLen(10, 'Findings'), V.noMarkup('Findings')], cause: [V.required('Cause')], recommendation: [V.required('Recommendation')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => post(`/claims/${c.id}/inspection`, f.values), 'Inspection report submitted')) onDone();
  };
  return (
    <Modal title="Inspection report" wide onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Submit report</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>{c.product_name} · <span className="mono">{c.serial_no}</span><br />Reported: {c.issue}</p>
        <Field label="What did you find?" required error={f.errors.findings} rules={[V.required('Findings'), V.minLen(10, 'Findings'), V.noMarkup('Findings')]} hint="Be specific: what is damaged, what you tested, what you saw">
          <textarea rows={4} maxLength={1500} {...f.bind('findings')} />
        </Field>
        <div className="form-grid">
          <Field label="Most likely cause" required error={f.errors.cause}>
            <select {...f.bind('cause')}><option value="">Select…</option>{Object.entries(CAUSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label="You recommend" required error={f.errors.recommendation}>
            <select {...f.bind('recommendation')}><option value="">Select…</option><option value="repair">Repair it</option><option value="replace">Replace it</option><option value="no_fault">No fault found</option></select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function Decide({ c, isAdmin, onClose, onDone }) {
  const f = useForm({ decision: 'approve', remedy: c.recommendation === 'repair' || c.recommendation === 'replace' ? c.recommendation : '', notes: '', goodwill: false });
  const { run, busy, error } = useAction(f.setErrors);
  const v = f.values;
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (v.decision === 'approve' && !v.remedy) errs.remedy = 'Choose repair or replacement';
    if (v.decision === 'approve' && !c.covered && !v.goodwill) errs.goodwill = 'The warranty had ended. Tick goodwill to approve anyway, or reject the claim.';
    if (v.decision === 'reject' && v.notes.trim().length < 10) errs.notes = 'Explain the reason for rejecting (at least 10 characters)';
    if (v.decision === 'approve' && v.notes.trim().length < 5) errs.notes = 'Add a short note';
    if (V.noMarkup('Notes')(v.notes)) errs.notes = 'Notes cannot contain < or >';
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => post(`/claims/${c.id}/decision`, { decision: v.decision, remedy: v.decision === 'approve' ? v.remedy : undefined, notes: v.notes, goodwill: v.goodwill }), v.decision === 'approve' ? 'Claim approved' : 'Claim rejected')) onDone();
  };
  return (
    <Modal title="Decide the claim" wide onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className={`btn ${v.decision === 'reject' ? 'danger' : ''}`} onClick={submit} disabled={busy}>{v.decision === 'approve' ? 'Approve claim' : 'Reject claim'}</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">
        <div className="claim-brief">
          <div><span>Warranty</span><b>{c.covered ? `Valid until ${fmtDate(c.warranty_end)}` : `Ended on ${fmtDate(c.warranty_end)}`}</b></div>
          <div><span>Cause found</span><b>{CAUSE[c.cause] || '-'}</b></div>
          <div><span>Technician recommends</span><b>{c.recommendation ? label(c.recommendation) : '-'}</b></div>
          <p className="full">{c.findings}</p>
        </div>
        <Seg value={v.decision} onChange={(d) => f.set('decision', d)} options={[['approve', 'Approve'], ['reject', 'Reject']]} />
        {v.decision === 'approve' && (
          <>
            <Field label="Remedy" error={f.errors.remedy}>
              <select {...f.bind('remedy')}><option value="">Select…</option><option value="repair">Repair the unit</option><option value="replace">Replace with a new unit</option></select>
            </Field>
            {!c.covered && (
              <label className="check"><input type="checkbox" checked={v.goodwill} disabled={!isAdmin} onChange={(e) => f.set('goodwill', e.target.checked)} /> Approve as goodwill although the warranty has ended {!isAdmin && <em className="muted">(admin only)</em>}</label>
            )}
            {f.errors.goodwill && <span style={{ color: 'var(--bad)' }}>{f.errors.goodwill}</span>}
            {c.recommendation === 'no_fault' && <div className="alert warn">The inspection found no fault. If you approve anyway, explain why.</div>}
          </>
        )}
        <Field label={v.decision === 'approve' ? 'Note' : 'Reason for rejecting (the customer will be told)'} error={f.errors.notes} required>
          <textarea rows={3} maxLength={1000} {...f.bind('notes')} />
        </Field>
      </div>
    </Modal>
  );
}

function Fulfil({ c, onClose, onDone }) {
  const replace = c.remedy === 'replace';
  const f = useForm({ replacementSerial: '', repairCost: '', notes: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const spare = useAsync(() => (replace ? get(`/inventory/units?productId=${c.product_id ?? ''}&status=in_stock&limit=8`) : Promise.resolve(null)), []);
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (replace) { if (!f.values.replacementSerial.trim()) errs.replacementSerial = 'Enter the serial number of the replacement'; else { const m = V.serialNo(f.values.replacementSerial); if (m) errs.replacementSerial = m; } }
    else if (f.values.notes.trim().length < 5) errs.notes = 'Describe the repair that was done';
    const cost = V.moneyAmount('Repair cost', 0, 10000000)(f.values.repairCost);
    if (cost) errs.repairCost = cost;
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => post(`/claims/${c.id}/fulfil`, { replacementSerial: replace ? f.values.replacementSerial.trim().toUpperCase() : undefined, repairCost: f.values.repairCost || undefined, notes: f.values.notes || undefined }), replace ? 'Replacement handed over' : 'Repair recorded')) onDone();
  };
  return (
    <Modal title={replace ? 'Hand over the replacement' : 'Record the repair'} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>{replace ? 'Hand over replacement' : 'Record repair'}</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">
        {replace ? (
          <>
            <Field label={`Serial number of the new ${c.product_name}`} required error={f.errors.replacementSerial} rules={[V.required('Serial number'), V.serialNo]} hint="Taken from stock. The faulty unit is marked faulty and the new one keeps the remaining warranty.">
              <input className="mono" value={f.values.replacementSerial} onChange={(e) => f.set('replacementSerial', e.target.value.toUpperCase())} />
            </Field>
            {spare.data?.items?.length > 0 && <div className="sugg"><span className="muted small">In stock, tap to use:</span>{spare.data.items.map((u) => <button key={u.id} type="button" className="chip-serial mono" onClick={() => f.set('replacementSerial', u.serial_no)}>{u.serial_no}</button>)}</div>}
            {spare.data && spare.data.items.length === 0 && <div className="alert bad">There is no {c.product_name} in stock. Receive one first on the Inventory page.</div>}
          </>
        ) : (
          <Field label="What was repaired" required error={f.errors.notes} rules={[V.required('Notes'), V.minLen(5, 'Notes'), V.noMarkup('Notes')]}><textarea rows={3} maxLength={1000} {...f.bind('notes')} /></Field>
        )}
        <Field label="Cost to us (₹, optional)" error={f.errors.repairCost} rules={[V.moneyAmount('Repair cost', 0, 10000000)]} hint="Parts and labour we absorb under the warranty"><input type="number" min="0" {...f.bind('repairCost')} /></Field>
        {replace && <Field label="Note (optional)" error={f.errors.notes}><textarea rows={2} maxLength={1000} {...f.bind('notes')} /></Field>}
      </div>
    </Modal>
  );
}

function Supplier({ c, onClose, onDone }) {
  const sending = c.rma === 'pending';
  const f = useForm({ reference: '', credit: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (sending && !f.values.reference.trim()) errs.reference = 'Enter the supplier return reference';
    if (!sending) { if (f.values.credit === '') errs.credit = 'Enter the credit received (0 if none)'; else { const m = V.moneyAmount('Credit', 0, 100000000)(f.values.credit); if (m) errs.credit = m; } }
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => post(`/claims/${c.id}/supplier-return`, sending ? { status: 'sent', reference: f.values.reference } : { status: 'credited', credit: Number(f.values.credit) }), sending ? 'Marked as sent' : 'Credit recorded')) onDone();
  };
  return (
    <Modal title={sending ? 'Faulty unit sent to the supplier' : 'Supplier credit received'} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Save</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      {sending
        ? <Field label="Supplier return reference" required error={f.errors.reference} rules={[V.required('Reference'), V.safeText('Reference', 60)]} hint="The RMA or courier number the supplier gave you"><input maxLength={60} {...f.bind('reference')} /></Field>
        : <Field label="Credit received (₹)" required error={f.errors.credit} rules={[V.required('Credit'), V.moneyAmount('Credit', 0, 100000000)]}><input type="number" min="0" {...f.bind('credit')} /></Field>}
    </Modal>
  );
}

function Withdraw({ c, onClose, onDone }) {
  const f = useForm({ reason: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    if (f.values.reason.trim().length < 5) return f.setErrors({ reason: 'Give a short reason (at least 5 characters)' });
    if (await run(() => post(`/claims/${c.id}/withdraw`, { reason: f.values.reason }), 'Claim withdrawn')) onDone();
  };
  return (
    <Modal title="Withdraw this claim" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Keep it</button><button className="btn danger" onClick={submit} disabled={busy}>Withdraw claim</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <Field label="Why is the customer withdrawing?" required error={f.errors.reason}><textarea rows={3} maxLength={500} {...f.bind('reason')} /></Field>
    </Modal>
  );
}

export default function ClaimDetail() {
  const { id } = useParams();
  const user = useCurrentUser();
  const state = useAsync(() => get(`/claims/${id}`), [id]);
  const [modal, setModal] = useState<string | null>(null);
  const { run } = useAction();
  const done = () => { setModal(null); state.reload(); };
  const support = can(user, 'support');
  const store = can(user, 'support', 'warehouse');

  return (
    <Async state={state}>{(c) => {
      const stepIdx = Math.max(0, CLAIM_STEPS.findIndex((s) => s.key === c.status));
      const ended = ['rejected', 'withdrawn'].includes(c.status);
      const isInspector = user.role === 'admin' || (user.role === 'technician' && c.technician_id === user.id);
      return (
        <>
          <PageHead crumb={<div className="crumb"><Link to="/claims">← Warranty claims</Link></div>} title={c.claim_no}
            sub={<><Link to={`/customers?id=${c.customer_id}`}>{c.customer_name}</Link> · {c.product_name} · <span className="mono">{c.serial_no}</span> · <Badge status={c.status}>{CLAIM_LABEL[c.status]}</Badge></>}
            actions={<>
              {support && ['filed', 'inspecting'].includes(c.status) && <button className="btn" onClick={() => setModal('assign')}>{c.status === 'filed' ? 'Book inspection' : 'Change inspection'}</button>}
              {c.status === 'inspecting' && isInspector && <button className="btn" onClick={() => setModal('inspect')}>Submit inspection report</button>}
              {support && c.status === 'inspected' && <button className="btn" onClick={() => setModal('decide')}>Decide the claim</button>}
              {support && ['filed', 'inspecting'].includes(c.status) && <button className="btn secondary danger-text" onClick={() => setModal('decide')}>Reject</button>}
              {store && c.status === 'approved' && <button className="btn" onClick={() => setModal('fulfil')}>{c.remedy === 'replace' ? 'Hand over replacement' : 'Record repair'}</button>}
              {support && c.status === 'fulfilled' && <button className="btn ok" onClick={() => setModal('close')}>Customer confirmed: close</button>}
              {can(user, 'warehouse') && c.rma === 'pending' && <button className="btn secondary" onClick={() => setModal('supplier')}>Send to supplier</button>}
              {can(user, 'warehouse') && c.rma === 'sent' && <button className="btn secondary" onClick={() => setModal('supplier')}>Credit received</button>}
              {support && ['filed', 'inspecting', 'inspected'].includes(c.status) && <button className="btn secondary" onClick={() => setModal('withdraw')}>Withdraw</button>}
            </>} />

          {ended ? (
            <div className={`alert ${c.status === 'rejected' ? 'bad' : 'warn'}`} style={{ marginBottom: 16 }}>
              {c.status === 'rejected'
                ? <><b>Rejected.</b> {c.decision_notes} {!c.covered && <>The unit can still be repaired as a paid job: <Link to="/tickets">raise a service ticket</Link>.</>}</>
                : <b>The customer withdrew this claim.</b>}
            </div>
          ) : (
            <Tracker steps={CLAIM_STEPS.map((s) => ({ key: s.key, label: s.label, at: null }))} current={stepIdx} finished={c.status === 'closed'} next={NEXT[c.status]} />
          )}

          {!c.covered && !ended && c.status !== 'closed' && !c.goodwill && (
            <div className="alert warn" style={{ marginBottom: 16 }}>The warranty had ended ({fmtDate(c.warranty_end)}) when this claim was filed. It can be rejected, or approved as goodwill by an admin.</div>
          )}

          <div className="grid split">
            <div className="stack">
              <Card title="The problem">
                <dl className="kv">
                  <dt>Reported</dt><dd>{c.issue}</dd>
                  <dt>Fault code</dt><dd className="mono">{c.fault_code || '-'}</dd>
                  <dt>Filed</dt><dd>{fmtDateTime(c.filed_at)}{c.filed_name ? ` by ${c.filed_name}` : ''}</dd>
                  {c.ticket_no && <><dt>Ticket</dt><dd>{c.ticket_no}</dd></>}
                  <dt>Customer</dt><dd><a href={`tel:${c.phone}`}>{c.phone}</a><div className="muted small">{c.address}{c.city ? `, ${c.city}` : ''}</div></dd>
                </dl>
              </Card>
              <Card title="Warranty check">
                <dl className="kv">
                  <dt>Result</dt><dd>{c.goodwill ? <Badge status="submitted">Goodwill approval</Badge> : c.covered ? <Badge status="in_warranty" /> : <Badge status="expired">Warranty ended</Badge>}</dd>
                  <dt>Valid until</dt><dd>{fmtDate(c.warranty_end)}</dd>
                  <dt>Product term</dt><dd>{c.warranty_months} months{c.unit_warranty_start ? `, started ${fmtDate(c.unit_warranty_start)}` : ''}</dd>
                  <dt>Unit</dt><dd><Link className="mono" to={`/lookup?serial=${c.serial_no}`}>{c.serial_no}</Link></dd>
                </dl>
              </Card>
              {(c.technician_id || c.findings) && (
                <Card title="Inspection">
                  <dl className="kv">
                    <dt>Technician</dt><dd>{c.technician_name || '-'}{c.technician_phone && <> · <a href={`tel:${c.technician_phone}`}>{c.technician_phone}</a></>}</dd>
                    <dt>Visit date</dt><dd>{fmtDate(c.inspection_date)}</dd>
                    {c.findings && <><dt>Findings</dt><dd>{c.findings}</dd><dt>Cause</dt><dd>{CAUSE[c.cause] || '-'}</dd><dt>Recommends</dt><dd>{label(c.recommendation)}</dd></>}
                  </dl>
                </Card>
              )}
              {c.decided_at && (
                <Card title="Decision">
                  <dl className="kv">
                    <dt>Outcome</dt><dd>{c.status === 'rejected' ? <Badge status="cancelled">Rejected</Badge> : <Badge status="ok">Approved</Badge>}{c.remedy && <> · {c.remedy === 'replace' ? 'Replace the unit' : 'Repair the unit'}</>}</dd>
                    <dt>By</dt><dd>{c.decided_name} · {fmtDateTime(c.decided_at)}</dd>
                    <dt>Note</dt><dd>{c.decision_notes}</dd>
                  </dl>
                </Card>
              )}
              {c.fulfilled_at && (
                <Card title={c.remedy === 'replace' ? 'Replacement' : 'Repair'}>
                  <dl className="kv">
                    {c.replacement_serial && <><dt>New unit</dt><dd><Link className="mono" to={`/lookup?serial=${c.replacement_serial}`}>{c.replacement_serial}</Link><div className="muted small">Keeps the remaining warranty until {fmtDate(c.warranty_end)}</div></dd></>}
                    <dt>Cost to us</dt><dd>{money(c.repair_cost, true)}</dd>
                    <dt>Done</dt><dd>{fmtDateTime(c.fulfilled_at)}</dd>
                    {c.fulfilment_notes && <><dt>Note</dt><dd>{c.fulfilment_notes}</dd></>}
                  </dl>
                </Card>
              )}
              {c.rma !== 'none' && (
                <Card title="Return to supplier">
                  <dl className="kv">
                    <dt>Status</dt><dd><Badge status={c.rma === 'credited' ? 'ok' : 'pending'}>{c.rma === 'pending' ? 'To be sent' : c.rma === 'sent' ? 'Sent, waiting for credit' : 'Credit received'}</Badge></dd>
                    <dt>Reference</dt><dd>{c.rma_reference || '-'}</dd>
                    <dt>Credit</dt><dd>{c.supplier_credit == null ? '-' : money(c.supplier_credit, true)}</dd>
                  </dl>
                </Card>
              )}
            </div>
            <Card title="Activity">
              {c.timeline.length === 0 ? <span className="muted">Nothing yet.</span> : (
                <ol className="claim-tl">{c.timeline.map((t, i) => (
                  <li key={i}><b>{TIMELINE[t.action] || label(t.action)}</b><span>{fmtDateTime(t.created_at)}{t.user_name ? ` · ${t.user_name}` : ''}</span></li>
                ))}</ol>
              )}
            </Card>
          </div>

          {modal === 'assign' && <Assign c={c} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'inspect' && <Inspect c={c} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'decide' && <Decide c={c} isAdmin={user.role === 'admin'} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'fulfil' && <Fulfil c={c} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'supplier' && <Supplier c={c} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'withdraw' && <Withdraw c={c} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'close' && <Confirm title="Close this claim?" yesLabel="Yes, close it" onNo={() => setModal(null)} onYes={async () => { setModal(null); if (await run(() => post(`/claims/${c.id}/close`), 'Claim closed')) state.reload(); }}
            message={<>Only close it once {c.customer_name} has confirmed that the {c.product_name} works.</>} />}
        </>
      );
    }}</Async>
  );
}
