import { useState } from 'react';
import { get, patch, post } from '../api';
import { Async, Badge, Card, Field, Modal, PageHead, label, money, useAction, useAsync, useForm } from '../components/ui';
import { validate, required, minLen, email, phone } from '../validators';

const ROLES = ['admin', 'sales', 'technician', 'warehouse', 'support', 'director'];

function NewUser({ onClose, onDone }) {
  const f = useForm({ name: '', email: '', password: '', role: 'sales', phone: '', hourlyRate: '0' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const v = f.values;
    const errs = validate(v, { name: [required('Name')], email: [required('Email'), email], phone: [phone],
      password: [required('Password'), minLen(8, 'Password'), (x) => (!/[A-Za-z]/.test(x) || !/\d/.test(x) ? 'Password needs a letter and a number' : null)] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => post('/users', { ...v, hourlyRate: Number(v.hourlyRate) || 0 }), 'User created')) onDone();
  };
  return (
    <Modal title="Add staff member" onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Create</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Name" error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Role"><select {...f.bind('role')}>{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select></Field>
        <Field label="Email" error={f.errors.email}><input type="email" {...f.bind('email')} /></Field>
        <Field label="Phone" error={f.errors.phone}><input {...f.bind('phone')} /></Field>
        <Field label="Temporary password" error={f.errors.password}><input type="password" autoComplete="new-password" {...f.bind('password')} /></Field>
        {f.values.role === 'technician' && <Field label="Hourly rate (₹)"><input type="number" min="0" {...f.bind('hourlyRate')} /></Field>}
      </div>
    </Modal>
  );
}

export default function Users() {
  const state = useAsync(() => get('/users/all'));
  const [adding, setAdding] = useState(false);
  const { run } = useAction();
  return (
    <>
      <PageHead title="Staff" sub="Roles control what each person can see and do" actions={<button className="btn" onClick={() => setAdding(true)}>+ Add staff</button>} />
      <Card pad={false}><Async state={state}>{(rows) => <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="num">Hourly rate</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map((u) => <tr key={u.id}><td><b>{u.name}</b></td><td>{u.email}</td><td style={{ textTransform: 'capitalize' }}>{label(u.role)}</td><td className="num">{u.role === 'technician' ? money(u.hourly_rate) : '-'}</td>
          <td><Badge status={u.active ? 'ok' : 'cancelled'}>{u.active ? 'Active' : 'Disabled'}</Badge></td>
          <td className="right"><button className="btn sm secondary" onClick={async () => { if (await run(() => patch(`/users/${u.id}`, { active: !u.active }), u.active ? 'User disabled' : 'User enabled')) state.reload(); }}>{u.active ? 'Disable' : 'Enable'}</button></td></tr>)}</tbody></table></div>}</Async></Card>
      {adding && <NewUser onClose={() => setAdding(false)} onDone={() => { setAdding(false); state.reload(); }} />}
    </>
  );
}
