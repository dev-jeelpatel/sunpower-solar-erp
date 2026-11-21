import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api';
import { Field, useForm, useAction } from '../components/ui';
import { validate, required, minLen, email, phone, normPhone, range } from '../validators';

// Public page: no login. The enquiry lands in the sales team's list immediately.
export default function PublicEnquiry() {
  const f = useForm({ name: '', phone: '', email: '', address: '', city: '', requestedKw: '3', systemType: 'on_grid', subsidyRequired: false, message: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = f.values;
    const errs = validate(v, {
      name: [required('Name'), minLen(2, 'Name')], phone: [required('Phone number'), phone], email: [email],
      address: [required('Address'), minLen(8, 'Address')], requestedKw: [required('System size'), range(1, 5, 'System size')],
    });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => post('/public/enquiries', { ...v, phone: normPhone(v.phone), requestedKw: Number(v.requestedKw) }));
    if (ok) setDone(true);
  };

  return (
    <div>
      <div className="hero">
        <div className="brand" style={{ justifyContent: 'center' }}><span className="logo">☀️</span> SunPower Solutions</div>
        <h1>Power your roof. Cut your bill.</h1>
        <p>Tell us what you need. A solar advisor will call you, check your roof and send a clear quote.</p>
      </div>
      <div className="public-wrap">
        {done ? (
          <div className="card card-pad stack" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <h2>Thank you! We have your request.</h2>
            <p className="muted">Our team will call you shortly to understand your roof and electricity needs.</p>
            <button className="btn secondary" onClick={() => { f.reset(); setDone(false); }}>Submit another enquiry</button>
          </div>
        ) : (
          <form className="card card-pad stack" onSubmit={submit} noValidate>
            <h2>Request a free quote</h2>
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
            <div className="small muted" style={{ textAlign: 'center' }}>Staff? <Link to="/login">Sign in</Link></div>
          </form>
        )}
      </div>
    </div>
  );
}
