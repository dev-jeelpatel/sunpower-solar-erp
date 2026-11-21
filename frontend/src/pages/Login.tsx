import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Field, useAction, useForm } from '../components/ui';
import { email, required, validate } from '../validators';
import * as V from '../validators';

// [login name, role, what they can do, icon path, colour tone]
const DEMO: [string, string, string, string, string][] = [
  ['admin', 'Admin', 'Full access', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4', 'indigo'],
  ['sales', 'Sales', 'Enquiries & quotes', 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z', 'blue'],
  ['warehouse', 'Warehouse', 'Stock & dispatch', 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', 'amber'],
  ['tech1', 'Technician', 'Surveys & installs', 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z', 'green'],
  ['support', 'Support', 'Tickets & warranty', 'M3 18v-6a9 9 0 0 1 18 0v6M3 18a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2zM21 18a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z', 'rose'],
  ['director', 'Director', 'Reports, read-only', 'M3 3v18h18M7 14l4-4 4 4 5-6', 'violet'],
];

const PERKS: [string, string][] = [
  ['Enquiry to warranty in one place', 'Sales, warehouse, crews and support share one live record.'],
  ['Every part tracked by serial number', 'Know exactly which unit went to which customer.'],
  ['Profit visible on every job', 'Revenue, material and labour cost, per installation.'],
];

const Sun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

export default function Login() {
  const { user, login } = useAuth();
  const f = useForm({ email: '', password: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const [show, setShow] = useState(false);
  const [picked, setPicked] = useState('');
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(f.values, { email: [required('Email'), email], password: [required('Password')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    await run(() => login(f.values.email.trim(), f.values.password));
  };

  const fill = (k: string) => { setPicked(k); f.setValues({ email: `${k}@sunpower.test`, password: 'Sunpower@123' }); f.setErrors({}); };

  return (
    <div className="auth">
      <main className="auth-main">
        <div className="auth-card">
          <Link to="/home" className="auth-mobile-brand"><span><Sun /></span>SunPower<b>Solar ERP</b></Link>
          <h2>Welcome back</h2>
          <p className="muted auth-sub">Sign in with your staff account to continue.</p>

          <form onSubmit={submit} noValidate className="stack" style={{ gap: 14 }}>
            {error && <div className="alert bad" role="alert">{error}</div>}
            <Field label="Email" rules={[V.required('Email'), V.email]} error={f.errors.email}>
              <input type="email" autoComplete="username" autoFocus {...f.bind('email')} placeholder="you@sunpower.test" />
            </Field>
            <Field label="Password" error={f.errors.password}>
              <div className="pw">
                <input type={show ? 'text' : 'password'} autoComplete="current-password" {...f.bind('password')} placeholder="Enter your password" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
              </div>
            </Field>
            <button className="btn auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>

          <div className="auth-demo">
            <div className="demo-head">
              <div>
                <b>Try a demo account</b>
                <span aria-live="polite">{picked ? <>Signing in as <em>{DEMO.find((x) => x[0] === picked)?.[1]}</em>. Press Sign in.</> : 'Pick a role to fill in the form'}</span>
              </div>
              <code className="mono">Sunpower@123</code>
            </div>
            <div className="demo-grid" role="group" aria-label="Demo accounts">
              {DEMO.map(([k, l, d, icon, tone]) => (
                <button type="button" key={k} data-tone={tone} title={d} className={picked === k ? 'on' : ''} onClick={() => fill(k)} aria-pressed={picked === k}>
                  <span className="demo-ic" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                  </span>
                  <span className="demo-tx"><b>{l}</b><small>{d}</small></span>
                  <i className="demo-ck" aria-hidden="true">✓</i>
                </button>
              ))}
            </div>
          </div>

          <div className="auth-links">
            <Link to="/home">← Back to website</Link>
            <span>Customer? <Link to="/enquire">Request a free quote</Link></span>
          </div>
        </div>
      </main>

      <aside className="auth-side">
        <div className="auth-caption">
          <h1>Run every solar installation from one dashboard.</h1>
          <p>The operations system behind SunPower: from the first enquiry to the 20-year warranty.</p>
          <ul>{PERKS.map(([t, d]) => <li key={t} title={d}><i aria-hidden="true">✓</i>{t}</li>)}</ul>
        </div>
      </aside>
    </div>
  );
}
