import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { del, get, post, put } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Confirm, Empty, Field, Modal, PageHead, fmtDate, money, useAction, useAsync, useDebounced, useForm } from '../components/ui';
import { validate, required, personName, addressText, cityName, email as emailRule, phone as phoneRule } from '../validators';
import { Kpi, KpiRow, Person, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
import * as V from '../validators';

function CustomerForm({ c, onClose, onDone }) {
  const f = useForm({ name: c?.name || '', phone: c?.phone || '', email: c?.email || '', address: c?.address || '', city: c?.city || '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const errs = validate(f.values, { name: [required('Name'), personName('Name')], phone: [required('Mobile number'), phoneRule], email: [emailRule], address: [required('Address'), addressText('Address')], city: [cityName] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await run(() => (c ? put(`/customers/${c.id}`, f.values) : post('/customers', f.values)), 'Customer saved')) onDone();
  };
  return (
    <Modal title={c ? 'Edit customer' : 'New customer'} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>Save</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Name" mask="name" rules={[V.required('Name'), V.personName('Name')]} error={f.errors.name}><input {...f.bind('name')} /></Field>
        <Field label="Mobile number" mask="phone" rules={[V.required('Mobile number'), V.phone]} error={f.errors.phone}><input {...f.bind('phone')} /></Field>
        <Field label="Email" mask="email" rules={[V.email]} error={f.errors.email}><input type="email" {...f.bind('email')} /></Field>
        <Field label="City" mask="city" rules={[V.cityName]}><input {...f.bind('city')} /></Field>
        <Field label="Address" mask="address" rules={[V.required('Address'), V.addressText('Address')]} className="full" error={f.errors.address}><input {...f.bind('address')} /></Field>
      </div>
    </Modal>
  );
}

function Detail({ id, onClose, onEdit, onDelete }) {
  const state = useAsync(() => get(`/customers/${id}`), [id]);
  const user = useCurrentUser();
  return (
    <Modal title="Customer" onClose={onClose} wide footer={state.data && <>
      {can(user) && <button className="btn secondary danger-text" onClick={() => onDelete(state.data)}>Delete</button>}
      {can(user, 'sales', 'support') && <button className="btn" onClick={() => onEdit(state.data)}>Edit details</button>}
    </>}>
      <Async state={state}>{(c) => (
        <div className="stack">
          <div><h2>{c.name}</h2><div className="muted">{c.phone}{c.email ? ` · ${c.email}` : ''}</div><div>{c.address}{c.city ? `, ${c.city}` : ''}</div></div>
          <div><h3>Orders</h3>{c.orders.length === 0 ? <span className="muted">None</span> : c.orders.map((o) => <div key={o.id}><Link to={`/orders/${o.id}`}>{o.order_no}</Link> · {money(o.total)} <Badge status={o.status} /></div>)}</div>
          <div><h3>Equipment & warranty</h3>{c.units.length === 0 ? <span className="muted">No serial-numbered equipment delivered yet</span> :
            <div className="table-wrap"><table><tbody>{c.units.map((u) => <tr key={u.serial_no}><td>{u.name}</td><td className="mono">{u.serial_no}</td><td>until {fmtDate(u.warranty_end)}</td><td><Badge status={u.warranty_state} /></td></tr>)}</tbody></table></div>}</div>
          <div><h3>Service tickets</h3>{c.tickets.length === 0 ? <span className="muted">None</span> : c.tickets.map((t) => <div key={t.id}><Link to={`/tickets/${t.id}`}>{t.ticket_no}</Link> · {t.subject} <Badge status={t.status} /></div>)}</div>
        </div>)}</Async>
    </Modal>
  );
}

export default function Customers() {
  const [q, setQ] = useState('');
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<any>(params.get('id') ? Number(params.get('id')) : null); // other pages link here with ?id=
  const closeDetail = () => { setOpen(null); if (params.get('id')) setParams({}, { replace: true }); };
  const [form, setForm] = useState<any>(null);
  const [ask, setAsk] = useState<any>(null);
  const user = useCurrentUser();
  const { run } = useAction();
  const dq = useDebounced(q);
  const state = useAsync(() => get(`/customers?limit=100&q=${encodeURIComponent(dq)}`), [dq]);
  return (
    <>
      <PageHead title="Customers" sub="Everyone who has placed an order" actions={can(user, 'sales', 'support') && <button className="btn" onClick={() => setForm({})}><Icon n="plus" />New customer</button>} />
      <Async state={state}>{(d: any) => {
        const items: any[] = d.items;
        const orders = items.reduce((a, c) => a + Number(c.orders || 0), 0);
        const withTickets = items.filter((c) => Number(c.open_tickets) > 0).length;
        const repeat = items.filter((c) => Number(c.orders) > 1).length;
        return (
          <div className="page-stack">
            <KpiRow>
              <Kpi icon="users" tone="indigo" label="Customers" value={items.length} sub={dq ? `matching “${dq}”` : 'on your books'} />
              <Kpi icon="box" tone="blue" label="Orders placed" value={orders} sub="across all customers" />
              <Kpi icon="user" tone="green" label="Repeat customers" value={repeat} sub="more than one order" />
              <Kpi icon="ticket" tone={withTickets ? 'rose' : 'amber'} label="With open tickets" value={withTickets} sub={withTickets ? 'need support attention' : 'all clear'} />
            </KpiRow>
            <div className="toolbar" style={{ margin: 0 }}><input className="search" placeholder="Search name, phone or city…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Card pad={false}>
              {items.length === 0 ? <Empty>No customers found.</Empty> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Customer</th><th>City</th><th>Orders</th><th>Open tickets</th><th>Customer since</th><th /></tr></thead>
                  <tbody>{items.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}>
                      <td><Person name={c.name} sub={c.phone} /></td>
                      <td><span className="ico-txt"><Icon n="pin" />{c.city || '-'}</span></td>
                      <td>{Number(c.orders) > 1 ? <Tag tone="violet">{c.orders} orders · repeat</Tag> : <Tag>{c.orders} order{Number(c.orders) === 1 ? '' : 's'}</Tag>}</td>
                      <td>{Number(c.open_tickets) > 0 ? <Tag tone="rose">{c.open_tickets} open</Tag> : <span className="muted">None</span>}</td>
                      <td className="nowrap">{fmtDate(c.created_at)}</td>
                      <td className="num"><a className="callbtn" href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} aria-label={`Call ${c.name}`} title={`Call ${c.name}`}><Icon n="phone" /></a></td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </Card>
          </div>
        );
      }}</Async>
      {open && <Detail id={open} onClose={closeDetail} onEdit={(c) => { closeDetail(); setForm(c); }} onDelete={(c) => { closeDetail(); setAsk(c); }} />}
      {form && <CustomerForm c={form.id ? form : null} onClose={() => setForm(null)} onDone={() => { setForm(null); state.reload(); }} />}
      {ask && <Confirm danger yesLabel="Delete" title="Delete customer?" onNo={() => setAsk(null)}
        onYes={async () => { const c = ask; setAsk(null); if (await run(() => del(`/customers/${c.id}`), 'Customer deleted')) state.reload(); }}
        message={<>“{ask.name}” will be removed. This only works for a customer with no orders, equipment or tickets.</>} />}
    </>
  );
}
