import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, fmtDate, fmtDateTime, label, money, useAction, useAsync, useForm } from '../components/ui';
import { validate, required, positive } from '../validators';

const FLOW = ['new', 'contacted', 'qualified', 'survey_scheduled', 'survey_approved', 'quoted', 'won'];

function QualifyModal({ e, onClose, onDone }) {
  const f = useForm({ decision: 'qualified', shadowFreeSqft: e.shadow_free_sqft ?? '', monthlyBill: e.monthly_bill ?? '', gridSuitable: e.grid_suitable == null ? '' : String(e.grid_suitable), notes: e.qualification_notes || '' });
  const { run, busy, error } = useAction(f.setErrors);
  const v = f.values;
  const submit = async () => {
    const rules: Record<string, any[]> = v.decision === 'qualified' ? { shadowFreeSqft: [required('Shadow-free area'), positive('Area')], monthlyBill: [required('Monthly bill')], gridSuitable: [required('Grid suitability')] } : {};
    const errs = validate(v, rules);
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => post(`/enquiries/${e.id}/qualify`, {
      decision: v.decision, notes: v.notes,
      shadowFreeSqft: v.shadowFreeSqft === '' ? undefined : Number(v.shadowFreeSqft), monthlyBill: v.monthlyBill === '' ? undefined : Number(v.monthlyBill),
      gridSuitable: v.gridSuitable === '' ? undefined : v.gridSuitable === 'true',
    }), 'Call outcome saved');
    if (ok) onDone();
  };
  return (
    <Modal title="Log the phone call" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>Save</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Outcome" className="full"><select {...f.bind('decision')}>
          <option value="qualified">Looks good → proceed to site survey</option><option value="contacted">Spoke / need to call back</option><option value="not_suitable">Not suitable → close enquiry</option></select></Field>
        <Field label="Shadow-free roof area (sq ft)" error={f.errors.shadowFreeSqft}><input type="number" min="0" {...f.bind('shadowFreeSqft')} /></Field>
        <Field label="Monthly electricity bill (₹)" error={f.errors.monthlyBill}><input type="number" min="0" {...f.bind('monthlyBill')} /></Field>
        <Field label="Grid connection suitable?" error={f.errors.gridSuitable}><select {...f.bind('gridSuitable')}><option value="">Select…</option><option value="true">Yes</option><option value="false">No</option></select></Field>
        <Field label="Notes" className="full"><textarea {...f.bind('notes')} /></Field>
      </div>
    </Modal>
  );
}

function SurveyModal({ e, onClose, onDone }) {
  const techs = useAsync(() => get('/users?role=technician'));
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const f = useForm({ technicianId: '', scheduledDate: tomorrow });
  const { run, busy } = useAction(f.setErrors);
  const submit = async () => {
    const errs = validate(f.values, { technicianId: [required('Technician')], scheduledDate: [required('Date')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => post('/surveys', { enquiryId: e.id, technicianId: Number(f.values.technicianId), scheduledDate: f.values.scheduledDate }), 'Survey scheduled');
    if (ok) onDone();
  };
  return (
    <Modal title="Schedule site survey" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Schedule</button></>}>
      <div className="form-grid">
        <Field label="Technician" error={f.errors.technicianId}><select {...f.bind('technicianId')}><option value="">Select…</option>{(techs.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Visit date" error={f.errors.scheduledDate}><input type="date" min={new Date().toISOString().slice(0, 10)} {...f.bind('scheduledDate')} /></Field>
      </div>
    </Modal>
  );
}

function QuoteModal({ e, onClose }) {
  const nav = useNavigate();
  const pk = useAsync(() => get('/catalog/packages'));
  const f = useForm({ packageId: '', discount: '0' });
  const { run, busy } = useAction(f.setErrors);
  const options = (pk.data || []).filter((p) => p.kind === e.system_type);
  const sel = options.find((p) => String(p.id) === String(f.values.packageId));
  const suggested = options.find((p) => Number(p.capacity_kw) === Number(e.requested_kw));
  const pid = f.values.packageId || suggested?.id || '';
  const pkg = options.find((p) => String(p.id) === String(pid)) || sel;
  const submit = async () => {
    if (!pid) return f.setErrors({ packageId: 'Choose a package' });
    const r = await run(() => post('/quotes', { enquiryId: e.id, packageId: Number(pid), discount: Number(f.values.discount) || 0 }), 'Quote created');
    if (r?.id) nav(`/quotes/${r.id}`);
  };
  return (
    <Modal title="Create quote from template" onClose={onClose} wide footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy || !pkg}>Create quote</button></>}>
      <div className="form-grid">
        <Field label="Package" error={f.errors.packageId}><select value={pid} onChange={(ev) => f.set('packageId', ev.target.value)}>{options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Discount (₹)" error={f.errors.discount}><input type="number" min="0" {...f.bind('discount')} /></Field>
      </div>
      {pkg && (
        <div style={{ marginTop: 16 }}>
          <h3>Parts that will be included automatically</h3>
          <div className="table-wrap"><table><thead><tr><th>Part</th><th className="num">Qty</th><th className="num">Unit price</th></tr></thead>
            <tbody>{pkg.items.map((i) => <tr key={i.productId}><td>{i.name}</td><td className="num">{i.quantity}</td><td className="num">{money(i.unitPrice)}</td></tr>)}</tbody></table></div>
          <p className="muted small">List price before GST: <b>{money(pkg.list_price)}</b></p>
        </div>
      )}
    </Modal>
  );
}

function ReviewModal({ s, onClose, onDone }) {
  const f = useForm({ notes: '' });
  const { run, busy } = useAction();
  const go = async (decision) => { if (await run(() => post(`/surveys/${s.id}/review`, { decision, notes: f.values.notes }), decision === 'approve' ? 'Survey approved' : 'Survey rejected')) onDone(); };
  return (
    <Modal title="Review survey" onClose={onClose} footer={<><button className="btn danger" disabled={busy} onClick={() => go('reject')}>Reject</button><button className="btn ok" disabled={busy} onClick={() => go('approve')}>Approve</button></>}>
      <dl className="kv"><dt>Roof direction</dt><dd>{s.roof_direction}</dd><dt>Tilt</dt><dd>{s.roof_tilt_deg}°</dd><dt>Cable distance</dt><dd>{s.cable_distance_m} m</dd><dt>Usable area</dt><dd>{s.usable_area_sqft} sq ft</dd><dt>Technician notes</dt><dd>{s.notes || '-'}</dd></dl>
      <Field label="Review notes" className="full"><textarea {...f.bind('notes')} /></Field>
    </Modal>
  );
}

export default function EnquiryDetail() {
  const { id } = useParams();
  const user = useCurrentUser();
  const state = useAsync(() => get(`/enquiries/${id}`), [id]);
  const [modal, setModal] = useState<any>(null);
  const sales = can(user, 'sales');
  const done = () => { setModal(null); state.reload(); };

  return (
    <Async state={state}>{(e) => {
      const stepIdx = FLOW.indexOf(e.status);
      const toReview = e.surveys.find((s) => s.status === 'completed');
      return (
        <>
          <PageHead crumb={<div className="crumb"><Link to="/enquiries">← Enquiries</Link></div>} title={e.customer_name} sub={`${e.phone}${e.email ? ' · ' + e.email : ''}`}
            actions={sales && <>
              {['new', 'contacted', 'qualified'].includes(e.status) && <button className="btn secondary" onClick={() => setModal('qualify')}>📞 Log call</button>}
              {e.status === 'qualified' && <button className="btn" onClick={() => setModal('survey')}>Schedule survey</button>}
              {toReview && <button className="btn" onClick={() => setModal('review')}>Review survey</button>}
              {['survey_approved', 'quoted'].includes(e.status) && <button className="btn" onClick={() => setModal('quote')}>Create quote</button>}
            </>} />
          {e.status === 'lost' ? <div className="alert bad" style={{ marginBottom: 16 }}>This enquiry was closed as not suitable.</div>
            : <div className="steps" style={{ marginBottom: 16 }}>{FLOW.map((s, i) => <span key={s} className={`step ${i < stepIdx || e.status === 'won' ? 'done' : i === stepIdx ? 'now' : ''}`}>{label(s)}</span>)}</div>}
          <div className="grid split">
            <div className="stack">
              <Card title="Request">
                <dl className="kv">
                  <dt>System</dt><dd>{e.requested_kw} kW {label(e.system_type)}{e.subsidy_required && <> · <Badge status="submitted">Wants subsidy</Badge></>}</dd>
                  <dt>Address</dt><dd>{e.address}{e.city ? `, ${e.city}` : ''}</dd>
                  <dt>Message</dt><dd>{e.message || '-'}</dd>
                  <dt>Source</dt><dd style={{ textTransform: 'capitalize' }}>{label(e.source)}</dd>
                  <dt>Assigned to</dt><dd>{e.assigned_name || 'Unassigned'}</dd>
                </dl>
              </Card>
              <Card title="Phone check">
                {e.grid_suitable == null && e.shadow_free_sqft == null ? <Empty>Not called yet</Empty> : (
                  <dl className="kv"><dt>Shadow-free area</dt><dd>{e.shadow_free_sqft ?? '-'} sq ft</dd><dt>Monthly bill</dt><dd>{money(e.monthly_bill)}</dd>
                    <dt>Grid suitable</dt><dd>{e.grid_suitable == null ? '-' : e.grid_suitable ? 'Yes' : 'No'}</dd><dt>Notes</dt><dd>{e.qualification_notes || '-'}</dd></dl>)}
              </Card>
              <Card title="Site surveys" pad={false}>
                {e.surveys.length === 0 ? <Empty>No survey booked</Empty> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Technician</th><th>Roof</th><th>Status</th></tr></thead>
                  <tbody>{e.surveys.map((s) => <tr key={s.id}><td>{fmtDate(s.scheduled_date)}</td><td>{s.technician_name}</td>
                    <td>{s.roof_direction ? `${s.roof_direction}-facing, ${s.roof_tilt_deg}° tilt, ${s.cable_distance_m} m cable` : '-'}</td><td><Badge status={s.status} /></td></tr>)}</tbody></table></div>}
              </Card>
              <Card title="Quotes" pad={false}>
                {e.quotes.length === 0 ? <Empty>Quotes can be created once the survey is approved</Empty> : <div className="table-wrap"><table><tbody>
                  {e.quotes.map((q) => <tr key={q.id}><td><Link to={`/quotes/${q.id}`}>{q.quote_no}</Link></td><td className="num">{money(q.total)}</td><td><Badge status={q.status} /></td></tr>)}</tbody></table></div>}
              </Card>
            </div>
            <Card title="Activity"><ul className="timeline">{e.activity.map((a, i) => <li key={i}><b style={{ textTransform: 'capitalize' }}>{label(a.action.replace('call_logged:', 'call: '))}</b><div className="muted small">{a.user_name || 'Website'} · {fmtDateTime(a.created_at)}</div></li>)}</ul></Card>
          </div>
          {modal === 'qualify' && <QualifyModal e={e} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'survey' && <SurveyModal e={e} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'quote' && <QuoteModal e={e} onClose={() => setModal(null)} />}
          {modal === 'review' && toReview && <ReviewModal s={toReview} onClose={() => setModal(null)} onDone={done} />}
        </>
      );
    }}</Async>
  );
}
