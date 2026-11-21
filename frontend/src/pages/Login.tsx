import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Field, useForm, useAction } from '../components/ui';
import { validate, required, email } from '../validators';

const DEMO = [['sales', 'Sales'], ['tech1', 'Technician'], ['warehouse', 'Warehouse'], ['support', 'Support'], ['director', 'Director'], ['admin', 'Admin']];

export default function Login() {
  const { user, login } = useAuth();
  const f = useForm({ email: '', password: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const [show, setShow] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(f.values, { email: [required('Email'), email], password: [required('Password')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    await run(() => login(f.values.email.trim(), f.values.password));
  };

  return (
    <div className="login-wrap">
      <form className="card card-pad login-card stack" onSubmit={submit} noValidate>
        <div style={{ textAlign: 'center' }}>
          <div className="brand" style={{ justifyContent: 'center', color: 'var(--text)' }}><span className="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></span> SunPower ERP</div>
          <p className="muted" style={{ margin: 0 }}>Sign in to continue</p>
        </div>
        {error && <div className="alert bad" role="alert">{error}</div>}
        <Field label="Email" error={f.errors.email}><input type="email" autoComplete="username" autoFocus {...f.bind('email')} placeholder="you@sunpower.test" /></Field>
        <Field label="Password" error={f.errors.password}>
          <input type={show ? 'text' : 'password'} autoComplete="current-password" {...f.bind('password')} />
        </Field>
        <label className="check small"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password</label>
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="small muted">
          Demo accounts (password <span className="mono">Sunpower@123</span>):
          <div className="demo-users">
            {DEMO.map(([k, l]) => <button type="button" key={k} onClick={() => f.setValues({ email: `${k}@sunpower.test`, password: 'Sunpower@123' })}>{l}</button>)}
          </div>
        </div>
        <div className="small" style={{ textAlign: 'center' }}>Customer? <Link to="/enquire">Request a free quote</Link></div>
      </form>
    </div>
  );
}
