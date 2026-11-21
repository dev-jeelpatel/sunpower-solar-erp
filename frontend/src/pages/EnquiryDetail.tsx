import TechPicker from '../components/TechPicker';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { del, get, post, put } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Confirm, Empty, Field, Modal, PageHead, Seg, fmtDate, fmtDateTime, label, money, useAction, useAsync, useForm } from '../components/ui';
import { Tracker } from '../components/kit';
import { Icon } from '../components/icons';
import { validate, required, positive, personName, addressText, cityName, safeText, email as emailRule, phone as phoneRule } from '../validators';
import * as V from '../validators';

const FLOW = ['new', 'contacted', 'qualified', 'survey_scheduled', 'survey_approved', 'quoted', 'won'];
const FLOW_LABEL: Record<string, string> = {
  new: 'Enquiry received', contacted: 'Customer called', qualified: 'Qualified', survey_scheduled: 'Survey booked',
  survey_approved: 'Survey approved', quoted: 'Quote sent', won: 'Won',
};
const FLOW_NEXT: Record<string, string> = {
  new: 'Call the customer and check their roof area, monthly bill and grid connection.',
  contacted: 'Complete the checklist to qualify the lead, or mark it not suitable.',
  qualified: 'Book a technician for the roof survey.',
  survey_scheduled: 'The technician visits the roof and submits measurements for approval.',
  survey_approved: 'Create a quote from one of the packages.',
  quoted: 'Waiting for the customer to accept the quote.',
  won: 'The customer accepted. Follow delivery and installation from the order.',
};

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
        <Field label="Shadow-free roof area (sq ft)" mask="digits" rules={[V.positive('Roof area'), V.wholeNumber('Roof area', 1, 100000)]} error={f.errors.shadowFreeSqft}><input type="number" min="0" {...f.bind('shadowFreeSqft')} /></Field>
        <Field label="Monthly electricity bill (₹)" mask="decimal" rules={[V.moneyAmount('Monthly bill', 0, 1000000)]} error={f.errors.monthlyBill}><input type="number" min="0" {...f.bind('monthlyBill')} /></Field>
        <Field label="Grid connection suitable?" error={f.errors.gridSuitable}><select {...f.bind('gridSuitable')}><option value="">Select…</option><option value="true">Yes</option><option value="false">No</option></select></Field>
        <Field label="Notes" mask="text" rules={[V.safeText('Notes', 1000)]} className="full"><textarea {...f.bind('notes')} /></Field>
      </div>
    </Modal>
  );
}

function SurveyModal({ e, onClose, onDone }) {
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const f = useForm({ technicianId: '', scheduledDate: tomorrow });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const errs = validate(f.values, { technicianId: [required('Technician')], scheduledDate: [required('Date')] });
    if (errs.technicianId) errs.technicianId = 'Choose an available technician';
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => post('/surveys', { enquiryId: e.id, technicianId: Number(f.values.technicianId), scheduledDate: f.values.scheduledDate }), 'Survey scheduled');
    if (ok) onDone();
  };
  return (
    <Modal title="Schedule site survey" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy || !f.values.technicianId}>Schedule</button></>}>
      <div className="stack">
        {error && !Object.keys(f.errors).length && <div className="alert bad">{error}</div>}
        <Field label="Visit date" error={f.errors.scheduledDate}><input type="date" min={new Date().toISOString().slice(0, 10)} {...f.bind('scheduledDate')} /></Field>
        <Field label="Technician (only free ones can be chosen)" error={f.errors.technicianId}>
          <TechPicker date={f.values.scheduledDate} value={f.values.technicianId} onChange={(id) => f.set('technicianId', id)} onPickDate={(d) => f.set('scheduledDate', d)} />
        </Field>
      </div>
    </Modal>
  );
}

function QuoteModal({ e, onClose }) {
  const nav = useNavigate();
  const pk = useAsync(() => get('/catalog/packages'));
  const prods = useAsync(() => get('/catalog/products'));
  const [type, setType] = useState<string>(e.system_type);
  const [packageId, setPackageId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [extras, setExtras] = useState<{ productId: string; quantity: string }[]>([]);
  const [err, setErr] = useState<Record<string, string>>({});
  const { run, busy, error } = useAction();

  // step 1 decides which packages are shown, step 2 picks one (the size the customer asked for is suggested)
  const options = (pk.data || []).filter((p) => p.kind === type);
  const suggested = options.find((p) => Number(p.capacity_kw) === Number(e.requested_kw));
  const pid = options.some((p) => String(p.id) === packageId) ? packageId : String(suggested?.id || '');
  const pkg = options.find((p) => String(p.id) === pid);
  const allProducts: any[] = prods.data || [];
  const priceOf = (id: string) => Number(allProducts.find((p) => String(p.product_id) === id)?.sell_price || 0);

  const extraTotal = extras.reduce((s, x) => s + priceOf(x.productId) * (Number(x.quantity) || 0), 0);
  const subtotal = Number(pkg?.list_price || 0) + extraTotal;
  const disc = Math.max(Number(discount) || 0, 0);
  const gst = Math.round((subtotal - disc) * 0.05 * 100) / 100;
  const total = subtotal - disc + gst;
  const setX = (i: number, k: string, v: string) => setExtras(extras.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!pid) errs.packageId = 'Choose a package';
    if (disc > subtotal) errs.discount = 'Discount is larger than the total';
    if (extras.some((x) => !x.productId || !(Number(x.quantity) >= 1))) errs.extras = 'Choose a product and a quantity for every extra item';
    else if (new Set(extras.map((x) => x.productId)).size !== extras.length) errs.extras = 'Each extra product can be added only once';
    setErr(errs);
    if (Object.keys(errs).length) return;
    const r = await run(() => post('/quotes', {
      enquiryId: e.id, packageId: Number(pid), discount: disc, systemType: type,
      extras: extras.map((x) => ({ productId: Number(x.productId), quantity: Number(x.quantity) })),
    }), 'Quote created');
    if (r?.id) nav(`/quotes/${r.id}`);
  };

  return (
    <Modal title="Create quote from template" onClose={onClose} wide footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy || !pkg}>Create quote</button></>}>
      {error && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stack">
        <div className="qm-step"><b><i>1</i>System type</b>
          <Seg value={type} onChange={(v) => { setType(v); setPackageId(''); }} options={[['on_grid', 'On-grid (with the grid)'], ['off_grid', 'Off-grid (with batteries)']]} />
          {type !== e.system_type && <span className="muted small">The customer asked for {label(e.system_type)}. Creating this quote will update the enquiry to {label(type)}.</span>}
        </div>

        <div className="qm-step"><b><i>2</i>Package</b>
          {!pk.loading && options.length === 0 ? (
            <div className="alert bad">There is no {label(type)} package. Create one in <Link to="/catalog" onClick={onClose}>Products &amp; packages</Link> first.</div>
          ) : (
            <Field label="" error={err.packageId}>
              <select value={pid} onChange={(ev) => setPackageId(ev.target.value)}>{options.map((p) => <option key={p.id} value={p.id}>{p.name}{Number(p.capacity_kw) === Number(e.requested_kw) ? ' (size the customer asked for)' : ''}</option>)}</select>
            </Field>
          )}
          {pkg && (
            <div className="table-wrap"><table><thead><tr><th>Included in the package</th><th className="num">Qty</th><th className="num">Unit price</th></tr></thead>
              <tbody>{pkg.items.map((i) => <tr key={i.productId}><td>{i.name}</td><td className="num">{i.quantity}</td><td className="num">{money(i.unitPrice)}</td></tr>)}</tbody></table></div>
          )}
        </div>

        <div className="qm-step"><b><i>3</i>Extra items <span className="muted small">(optional: add any other product the customer wants)</span></b>
          {extras.map((x, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
              <Field label={i === 0 ? 'Product' : ''} className="grow"><select value={x.productId} onChange={(ev) => setX(i, 'productId', ev.target.value)}><option value="">Select…</option>{allProducts.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} · {money(p.sell_price)}</option>)}</select></Field>
              <Field label={i === 0 ? 'Qty' : ''}><input type="number" min="1" style={{ width: 90 }} value={x.quantity} onChange={(ev) => setX(i, 'quantity', ev.target.value)} /></Field>
              <div className="qm-line">{money(priceOf(x.productId) * (Number(x.quantity) || 0))}</div>
              <button type="button" className="btn secondary sm" onClick={() => setExtras(extras.filter((_, j) => j !== i))} aria-label="Remove item">✕</button>
            </div>
          ))}
          {err.extras && <span style={{ color: 'var(--bad)' }}>{err.extras}</span>}
          <div><button type="button" className="btn secondary sm" onClick={() => setExtras([...extras, { productId: '', quantity: '1' }])}>+ Add an extra product</button></div>
        </div>

        <div className="qm-step"><b><i>4</i>Discount and total</b>
          <div className="form-grid">
            <Field label="Discount (₹)" mask="decimal" rules={[V.moneyAmount('Discount', 0, 100000000)]} error={err.discount}><input type="number" min="0" value={discount} onChange={(ev) => setDiscount(ev.target.value)} /></Field>
            <dl className="qm-total">
              <dt>Package</dt><dd>{money(pkg?.list_price || 0)}</dd>
              {extraTotal > 0 && <><dt>Extra items</dt><dd>{money(extraTotal)}</dd></>}
              {disc > 0 && <><dt>Discount</dt><dd>- {money(disc)}</dd></>}
              <dt>GST (5%)</dt><dd>{money(gst, true)}</dd>
              <dt><b>Total</b></dt><dd><b>{money(total, true)}</b></dd>
            </dl>
          </div>
        </div>
      </div>
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
      <Field label="Review notes" mask="text" rules={[V.safeText('Review notes', 1000)]} className="full"><textarea {...f.bind('notes')} /></Field>
    </Modal>
  );
}

function EditEnquiry({ e, onClose, onDone }) {
  const f = useForm({ name: e.customer_name, phone: e.phone, email: e.email || '', address: e.address, city: e.city || '', requestedKw: String(e.requested_kw), systemType: e.system_type, subsidyRequired: !!e.subsidy_required, message: e.message || '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const v = f.values;
    const errs = validate(v, { name: [required('Name'), personName('Name')], phone: [required('Mobile number'), phoneRule], email: [emailRule], address: [required('Address'), addressText('Address')], city: [cityName], message: [safeText('Message', 500)] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => put(`/enquiries/${e.id}`, { ...v, requestedKw: Number(v.requestedKw) }), 'Enquiry updated')) onDone();
  };
  return (
    <Modal title="Edit enquiry" onClose={onClose} wide footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>Save changes</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Name" mask="name" rules={[V.required('Name'), V.personName('Name')]} error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Mobile number" mask="phone" rules={[V.required('Mobile number'), V.phone]} error={f.errors.phone}><input {...f.bind('phone')} /></Field>
        <Field label="Email" mask="email" rules={[V.email]} error={f.errors.email}><input type="email" {...f.bind('email')} /></Field>
        <Field label="City" mask="city" rules={[V.cityName]}><input {...f.bind('city')} /></Field>
        <Field label="Address" mask="address" rules={[V.required('Address'), V.addressText('Address')]} className="full" error={f.errors.address}><input {...f.bind('address')} /></Field>
        <Field label="System size (kW)"><select {...f.bind('requestedKw')}>{[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{k} kW</option>)}</select></Field>
        <Field label="System type"><select {...f.bind('systemType')}><option value="on_grid">On-grid</option><option value="off_grid">Off-grid</option></select></Field>
        <Field label="Message" mask="text" rules={[V.safeText('Message', 500)]} className="full"><input {...f.bind('message')} /></Field>
        <label className="check full"><input type="checkbox" checked={f.values.subsidyRequired} onChange={(ev) => f.set('subsidyRequired', ev.target.checked)} /> Customer wants the government subsidy</label>
      </div>
    </Modal>
  );
}

/** Time a stage was reached, taken from the activity log (oldest matching entry). */
function stampFor(e: any, stage: string): string | null {
  const first = (test: (a: string) => boolean) => [...(e.activity || [])].reverse().find((x: any) => test(x.action))?.created_at ?? null;
  switch (stage) {
    case 'new': return e.created_at;
    case 'contacted': return first((a) => a.startsWith('call_logged'));
    case 'qualified': return first((a) => a === 'call_logged:qualified');
    case 'survey_scheduled': return first((a) => a === 'survey_scheduled');
    case 'survey_approved': return first((a) => a === 'survey_approved');
    case 'quoted': return first((a) => a === 'quote_created');
    default: return null;
  }
}

export default function EnquiryDetail() {
  const { id } = useParams();
  const user = useCurrentUser();
  const state = useAsync(() => get(`/enquiries/${id}`), [id]);
  const [modal, setModal] = useState<any>(null);
  const sales = can(user, 'sales');
  const nav = useNavigate();
  const { run } = useAction();
  const done = () => { setModal(null); state.reload(); };

  return (
    <Async state={state}>{(e) => {
      const stepIdx = FLOW.indexOf(e.status);
      const toReview = e.surveys.find((s) => s.status === 'completed');
      return (
        <>
          <PageHead crumb={<div className="crumb"><Link to="/enquiries">← Enquiries</Link></div>} title={e.customer_name} sub={<span className="contact-line"><a href={`tel:${e.phone}`}><Icon n="phone" />{e.phone}</a>{e.email && <a href={`mailto:${e.email}`}><Icon n="mail" />{e.email}</a>}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.address}${e.city ? `, ${e.city}` : ''}`)}`} target="_blank" rel="noreferrer" className="addr-chip" title="Open in Maps"><Icon n="pin" />{e.address}{e.city ? `, ${e.city}` : ''}</a></span>}
            actions={sales && <>
              {['new', 'contacted', 'qualified'].includes(e.status) && <button className="btn secondary" onClick={() => setModal('qualify')}>📞 Log call</button>}
              {e.status === 'qualified' && <button className="btn" onClick={() => setModal('survey')}>Schedule survey</button>}
              {toReview && <button className="btn" onClick={() => setModal('review')}>Review survey</button>}
              {['survey_approved', 'quoted'].includes(e.status) && <button className="btn" onClick={() => setModal('quote')}>Create quote</button>}
              {e.status !== 'won' && <button className="btn secondary" onClick={() => setModal('edit')}>Edit</button>}
              {e.status !== 'won' && !e.customer_id && e.quotes.length === 0 && <button className="btn secondary danger-text" onClick={() => setModal('delete')}>Delete</button>}
            </>} />
          {e.status === 'lost' ? <div className="alert bad" style={{ marginBottom: 16 }}>This enquiry was closed as not suitable.</div>
            : <Tracker
                steps={FLOW.map((k) => ({ key: k, label: FLOW_LABEL[k], at: stampFor(e, k) }))}
                current={stepIdx} finished={e.status === 'won'} next={FLOW_NEXT[e.status]} />}
          <div className="grid split">
            <div className="stack">
              <Card title="Request">
                <dl className="kv">
                  <dt>System</dt><dd>{e.requested_kw} kW {label(e.system_type)}{e.subsidy_required && <> · <Badge status="submitted">Wants subsidy</Badge></>}</dd>
                  <dt>Address</dt><dd>{e.address}{e.city ? `, ${e.city}` : ''}</dd>
                  <dt>Message</dt><dd>{e.message || '-'}</dd>
                  <dt>Source</dt><dd style={{ textTransform: 'capitalize' }}>{label(e.source)}</dd>
                  {e.customer_id && <><dt>Customer</dt><dd><Link to={`/customers?id=${e.customer_id}`}>Open customer record</Link></dd></>}
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
          {modal === 'edit' && <EditEnquiry e={e} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'delete' && <Confirm danger yesLabel="Delete" title="Delete this enquiry?" onNo={() => setModal(null)} onYes={async () => { setModal(null); if (await run(() => del(`/enquiries/${e.id}`), 'Enquiry deleted')) nav('/enquiries'); }} message={<>“{e.customer_name}” and its surveys and history will be removed. Use this for spam or duplicates only.</>} />}
          {modal === 'qualify' && <QualifyModal e={e} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'survey' && <SurveyModal e={e} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'quote' && <QuoteModal e={e} onClose={() => setModal(null)} />}
          {modal === 'review' && toReview && <ReviewModal s={toReview} onClose={() => setModal(null)} onDone={done} />}
        </>
      );
    }}</Async>
  );
}
