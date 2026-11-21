import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../api';
import { Async, Badge, Card, Empty, PageHead, Pager, fmtDate, label, money, useAsync, useDebounced } from '../components/ui';

export default function Orders() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const state = useAsync(() => get(`/orders?page=${page}&status=${status}&q=${encodeURIComponent(dq)}`), [page, status, dq]);
  return (
    <>
      <PageHead title="Orders" sub="Confirmed jobs flow to the warehouse and the installation crew automatically" />
      <div className="toolbar">
        <input className="search" placeholder="Search customer or order no…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>
          {['pending_payment', 'confirmed', 'dispatched', 'delivered', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
      </div>
      <Card pad={false}>
        <Async state={state}>{(d) => d.items.length === 0 ? <Empty>No orders.</Empty> : (
          <><div className="table-wrap"><table>
            <thead><tr><th>Order</th><th>Customer</th><th className="num">Total</th><th style={{ width: 180 }}>Paid</th><th>Created</th><th>Status</th></tr></thead>
            <tbody>{d.items.map((o) => (
              <tr key={o.id} className="clickable" onClick={() => nav(`/orders/${o.id}`)}>
                <td><b>{o.order_no}</b></td><td>{o.customer_name}</td><td className="num">{money(o.total)}</td>
                <td><div className="progress"><i style={{ width: `${Math.min(100, (o.paid / o.total) * 100)}%` }} /></div><span className="small muted">{money(o.paid)}</span></td>
                <td>{fmtDate(o.created_at)}</td><td><Badge status={o.status} /></td></tr>))}</tbody>
          </table></div><Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} /></>)}</Async>
      </Card>
    </>
  );
}
