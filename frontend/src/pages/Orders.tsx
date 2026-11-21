import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../api';
import { Async, Badge, Card, Empty, PageHead, Pager, fmtDate, label, money, useAsync, useDebounced } from '../components/ui';
import { Chips, Kpi, KpiRow, Meter, Person, ago } from '../components/kit';
import { Icon } from '../components/icons';

export default function Orders() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const state = useAsync(() => get(`/orders?page=${page}&status=${status}&q=${encodeURIComponent(dq)}`), [page, status, dq]);
  const all = useAsync(() => get('/orders?limit=100'), []);
  const items: any[] = all.data?.items || [];
  const live = items.filter((o) => o.status !== 'cancelled');
  const cnt = (s: string) => items.filter((o) => o.status === s).length;
  const outstanding = live.reduce((a, o) => a + Math.max(0, Number(o.total) - Number(o.paid)), 0);
  return (
    <>
      <PageHead title="Orders" sub="Confirmed jobs flow to the warehouse and the installation crew automatically" />
      <div className="page-stack">
        <KpiRow>
          <Kpi icon="wallet" tone="amber" label="Awaiting advance" value={cnt('pending_payment')} sub="orders not confirmed yet" />
          <Kpi icon="truck" tone="blue" label="In progress" value={cnt('confirmed') + cnt('dispatched') + cnt('delivered')} sub="packing, shipping or installing" />
          <Kpi icon="check" tone="green" label="Completed" value={cnt('completed')} sub="installed and signed off" />
          <Kpi icon="card" tone="rose" label="Still to collect" value={money(outstanding)} sub="across all live orders" />
        </KpiRow>
        <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { value: '', label: 'All', count: items.length },
          ...['pending_payment', 'confirmed', 'dispatched', 'delivered', 'completed', 'cancelled'].map((s) => ({ value: s, label: label(s), count: cnt(s) })),
        ]} />
        <div className="toolbar" style={{ margin: 0 }}>
          <input className="search" placeholder="Search customer or order no…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <Card pad={false}>
          <Async state={state}>{(d) => d.items.length === 0 ? <Empty>No orders match.</Empty> : (
            <><div className="table-wrap"><table>
              <thead><tr><th>Order</th><th>Customer</th><th className="num">Total</th><th style={{ width: 210 }}>Payment</th><th>Created</th><th>Status</th><th /></tr></thead>
              <tbody>{d.items.map((o) => {
                const pct = Number(o.total) ? (Number(o.paid) / Number(o.total)) * 100 : 0;
                return (
                  <tr key={o.id} className="clickable" onClick={() => nav(`/orders/${o.id}`)}>
                    <td><b>{o.order_no}</b></td>
                    <td><Person name={o.customer_name} /></td>
                    <td className="num"><span className="amt">{money(o.total)}</span></td>
                    <td><Meter value={Number(o.paid)} max={Number(o.total)} tone={pct >= 100 ? 'green' : pct > 0 ? 'indigo' : 'amber'} caption={`${money(o.paid)} · ${Math.round(pct)}%`} /></td>
                    <td className="nowrap"><b className="soft">{ago(o.created_at)}</b><span className="sub-line">{fmtDate(o.created_at)}</span></td>
                    <td><Badge status={o.status} /></td>
                    <td className="row-go"><Icon n="arrow" /></td>
                  </tr>
                );
              })}</tbody>
            </table></div><Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} /></>)}</Async>
        </Card>
      </div>
    </>
  );
}
