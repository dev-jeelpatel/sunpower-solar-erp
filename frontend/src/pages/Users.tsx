import { useState } from 'react';
import { get, patch, post } from '../api';
import { Async, Badge, Card, Field, Modal, PageHead, label, money, useAction, useAsync, useForm } from '../components/ui';
import { Chips, Kpi, KpiRow, Person, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
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

function EditUser({ u, onClose, onDone }) {
  const f = useForm({ name: u.name, role: u.role, hourlyRate: String(u.hourly_rate ?? 0), password: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const v = f.values;
    const errs = validate(v, { name: [required('Name')], password: [(x) => (x && (x.length < 8 || !/[A-Za-z]/.test(x) || !/\d/.test(x)) ? 'At least 8 characters with a letter and a number' : null)] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: any = { name: v.name, role: v.role, hourlyRate: Number(v.hourlyRate) || 0 };
    if (v.password) body.password = v.password;
    if (await run(() => patch(`/users/${u.id}`, body), 'Staff member updated')) onDone();
  };
  return (
    <Modal title={`Edit ${u.name}`} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Save</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Name" error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Role"><select {...f.bind('role')}>{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select></Field>
        {f.values.role === 'technician' && <Field label="Hourly rate (₹)"><input type="number" min="0" {...f.bind('hourlyRate')} /></Field>}
        <Field label="New password" hint="Leave blank to keep the current one" error={f.errors.password}><input type="password" autoComplete="new-password" {...f.bind('password')} /></Field>
      </div>
    </Modal>
  );
}

const ROLE_TONE: Record<string, 'violet' | 'blue' | 'green' | 'amber' | 'rose' | 'slate'> = {
  admin: 'violet', sales: 'blue', technician: 'green', warehouse: 'amber', support: 'rose', director: 'slate',
};
const ROLE_NOTE: Record<string, string> = {
  admin: 'Full access', sales: 'Enquiries, quotes, orders', technician: 'Surveys and installations',
  warehouse: 'Stock and dispatch', support: 'Tickets and warranty', director: 'Reports, read-only',
};

export default function Users() {
  const state = useAsync(() => get('/users/all'));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [role, setRole] = useState('');
  const { run } = useAction();
  return (
    <>
      <PageHead title="Staff" sub="Roles control what each person can see and do" actions={<button className="btn" onClick={() => setAdding(true)}><Icon n="plus" />Add staff</button>} />
      <Async state={state}>{(rows: any[]) => {
        const roles = ROLES.filter((r) => rows.some((u) => u.role === r));
        const shown = role ? rows.filter((u) => u.role === role) : rows;
        return (
          <div className="page-stack">
            <KpiRow>
              <Kpi icon="users" tone="indigo" label="Team members" value={rows.length} sub={`${roles.length} roles`} />
              <Kpi icon="check" tone="green" label="Active" value={rows.filter((u) => u.active).length} sub="can sign in" />
              <Kpi icon="wrench" tone="amber" label="Technicians" value={rows.filter((u) => u.role === 'technician').length} sub="on the installation crew" />
              <Kpi icon="shield" tone={rows.some((u) => !u.active) ? 'rose' : 'violet'} label="Disabled" value={rows.filter((u) => !u.active).length} sub="cannot sign in" />
            </KpiRow>
            <Chips value={role} onChange={setRole} options={[{ value: '', label: 'Everyone', count: rows.length }, ...roles.map((r) => ({ value: r, label: label(r), count: rows.filter((u) => u.role === r).length }))]} />
            <Card pad={false}><div className="table-wrap"><table>
              <thead><tr><th>Member</th><th>Role</th><th className="num">Hourly rate</th><th>Status</th><th /></tr></thead>
              <tbody>{shown.map((u) => (
                <tr key={u.id}>
                  <td><Person name={u.name} sub={u.email} role={u.role} /></td>
                  <td><Tag tone={ROLE_TONE[u.role] || 'slate'}>{label(u.role)}</Tag><span className="sub-line">{ROLE_NOTE[u.role]}</span></td>
                  <td className="num">{u.role === 'technician' ? <span className="amt">{money(u.hourly_rate)}</span> : <span className="muted">-</span>}</td>
                  <td><Badge status={u.active ? 'ok' : 'cancelled'}>{u.active ? 'Active' : 'Disabled'}</Badge></td>
                  <td className="right nowrap"><button className="btn sm secondary" onClick={() => setEditing(u)}>Edit</button> <button className="btn sm secondary" onClick={async () => { if (await run(() => patch(`/users/${u.id}`, { active: !u.active }), u.active ? 'User disabled' : 'User enabled')) state.reload(); }}>{u.active ? 'Disable' : 'Enable'}</button></td>
                </tr>))}</tbody>
            </table></div></Card>
          </div>
        );
      }}</Async>
      {editing && <EditUser u={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); state.reload(); }} />}
      {adding && <NewUser onClose={() => setAdding(false)} onDone={() => { setAdding(false); state.reload(); }} />}
    </>
  );
}
