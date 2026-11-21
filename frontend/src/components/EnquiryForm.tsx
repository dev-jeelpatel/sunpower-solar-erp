import { useState, type FormEvent } from 'react';
import { post } from '../api';
import { Field, useAction, useForm } from './ui';
import { email, minLen, normPhone, phone, range, required, validate } from '../validators';

/** Public enquiry form (no login). The enquiry lands in the sales team's list immediately. */
export default function EnquiryForm({ initialKw = '3', initialType = 'on_grid', title = 'Request a free quote' }: {
  initialKw?: string; initialType?: string; title?: string;
}) {
  const f = useForm({
    name: '', phone: '', email: '', address: '', city: '', requestedKw: initialKw, systemType: initialType, subsidyRequired: false, message: '',
  });
  const { run, busy, error } = useAction(f.setErrors);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = f.values;
    const errs = validate(v, {
      name: [required('Name'), minLen(2, 'Name')],
      phone: [required('Phone number'), phone],
      email: [email],
      address: [required('Address'), minLen(8, 'Address')],
      requestedKw: [required('System size'), range(1, 5, 'System size')],
    });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => post('/public/enquiries', { ...v, phone: normPhone(v.phone), requestedKw: Number(v.requestedKw) }));
    if (ok) setDone(true);
  };

  if (done) {
    return (
      <div className="card card-pad stack" style={{ textAlign: 'center' }}>
        <div className="done-mark" aria-hidden="true">✓</div>
        <h2>Thank you! We have your request.</h2>
        <p className="muted">Our team will call you shortly to understand your roof and electricity needs.</p>
        <button className="btn secondary" onClick={() => { f.reset(); setDone(false); }}>Submit another enquiry</button>
      </div>
    );
  }

  return (
    <form className="card card-pad stack" onSubmit={submit} noValidate>
      <h2>{title}</h2>
      {error && !Object.keys(f.errors).length && <div className="alert bad" role="alert">{error}</div>}
      <div className="form-grid">
        <Field label="Full name" required error={f.errors.name}><input {...f.bind('name')} autoComplete="name" /></Field>
        <Field label="Mobile number" required error={f.errors.phone} hint="10 digits, e.g. 98765 43210"><input inputMode="tel" autoComplete="tel" {...f.bind('phone')} /></Field>
        <Field label="Email (optional)" error={f.errors.email}><input type="email" autoComplete="email" {...f.bind('email')} /></Field>
        <Field label="City" error={f.errors.city}><input {...f.bind('city')} /></Field>
        <Field label="Installation address" required error={f.errors.address} className="full"><input {...f.bind('address')} autoComplete="street-address" /></Field>
        <Field label="System size" required error={f.errors.requestedKw}>
          <select {...f.bind('requestedKw')}>{[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{k} kW</option>)}</select>
        </Field>
        <Field label="System type" required error={f.errors.systemType} hint={f.values.systemType === 'off_grid' ? 'Includes battery backup' : 'Connected to the electricity grid'}>
          <select {...f.bind('systemType')}><option value="on_grid">On-Grid (grid connected)</option><option value="off_grid">Off-Grid (with battery)</option></select>
        </Field>
        <label className="check full"><input type="checkbox" checked={f.values.subsidyRequired} onChange={(e) => f.set('subsidyRequired', e.target.checked)} /> I want help claiming the government subsidy</label>
        <Field label="Anything else we should know?" error={f.errors.message} className="full"><textarea {...f.bind('message')} /></Field>
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Request free quote'}</button>
    </form>
  );
}
