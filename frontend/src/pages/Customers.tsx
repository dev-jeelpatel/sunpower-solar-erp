import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { Async, Badge, Card, Empty, Modal, PageHead, fmtDate, money, useAsync, useDebounced } from '../components/ui';

function Detail({ id, onClose }) {
  const state = useAsync(() => get(`/customers/${id}`), [id]);
  return (
    <Modal title="Customer" onClose={onClose} wide>
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
  const [open, setOpen] = useState<any>(null);
  const dq = useDebounced(q);
  const state = useAsync(() => get(`/customers?q=${encodeURIComponent(dq)}`), [dq]);
  return (
    <>
      <PageHead title="Customers" sub="Everyone who has placed an order" />
      <div className="toolbar"><input className="search" placeholder="Search name, phone or city…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Card pad={false}>
        <Async state={state}>{(d) => d.items.length === 0 ? <Empty>No customers found.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Phone</th><th>City</th><th className="num">Orders</th><th className="num">Open tickets</th><th>Since</th></tr></thead>
            <tbody>{d.items.map((c) => <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}><td><b>{c.name}</b></td><td>{c.phone}</td><td>{c.city || '-'}</td>
              <td className="num">{c.orders}</td><td className="num">{c.open_tickets || '-'}</td><td>{fmtDate(c.created_at)}</td></tr>)}</tbody>
          </table></div>)}</Async>
      </Card>
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
