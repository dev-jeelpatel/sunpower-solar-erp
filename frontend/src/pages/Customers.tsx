import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { Async, Badge, Card, Empty, Modal, PageHead, fmtDate, money, useAsync, useDebounced } from '../components/ui';
import { Kpi, KpiRow, Person, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';

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
  const state = useAsync(() => get(`/customers?limit=100&q=${encodeURIComponent(dq)}`), [dq]);
  return (
    <>
      <PageHead title="Customers" sub="Everyone who has placed an order" />
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
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
