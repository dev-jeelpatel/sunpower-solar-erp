import { useState } from 'react';
import { Link } from 'react-router-dom';
import { download, get, post } from '../api';
import { Async, Badge, Card, Empty, PageHead, Stat, Tabs, money, useAction, useAsync, useToast } from '../components/ui';

function Profit() {
  const [result, setResult] = useState('');
  const state = useAsync(() => get(`/reports/profitability?result=${result}`), [result]);
  return (
    <Async state={state}>{(d) => (
      <div className="stack">
        <div className="grid g4">
          <Stat label="Revenue (booked)" value={money(d.summary.revenue)} />
          <Stat label="Profit after materials & labour" value={money(d.summary.profit)} tone={d.summary.profit < 0 ? 'bad' : 'good'} />
          <Stat label="Made money" value={d.summary.profitable} tone="good" sub="installations" />
          <Stat label="Lost money" value={d.summary.losing} tone={d.summary.losing ? 'bad' : 'accent'} sub="installations" />
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <select value={result} onChange={(e) => setResult(e.target.value)}><option value="">All installations</option><option value="profit">Made money</option><option value="loss">Lost money</option></select>
          <button className="btn secondary" onClick={() => download('/reports/export/profitability.csv', 'profitability.csv')}>⬇ Export CSV</button>
        </div>
        <Card pad={false}>{d.items.length === 0 ? <Empty>No jobs.</Empty> : <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th className="num">Revenue</th><th className="num">Materials</th><th className="num">Labour</th><th className="num">Profit</th><th className="num">Margin</th></tr></thead>
          <tbody>{d.items.map((r) => <tr key={r.order_id}><td><Link to={`/orders/${r.order_id}`}>{r.order_no}</Link></td><td>{r.customer_name}</td><td><Badge status={r.order_status} /></td>
            <td className="num">{money(r.revenue)}</td><td className="num">{money(r.material_cost)}</td><td className="num">{money(r.labour_cost)} <span className="muted small">({r.labour_hours}h)</span></td>
            <td className="num"><b style={{ color: r.profit < 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(r.profit)}</b></td><td className="num">{r.margin_pct}%</td></tr>)}</tbody>
        </table></div>}</Card>
        <p className="muted small">Materials use each item's cost at the time of quoting; labour is technician hours × hourly rate from the signed-off job. Unfinished jobs show 0 labour so far.</p>
      </div>)}</Async>
  );
}

function Unfinished() {
  const state = useAsync(() => get('/reports/unfinished'));
  return (
    <div className="stack">
      <div><button className="btn secondary" onClick={() => download('/reports/export/unfinished.csv', 'unfinished-orders.csv')}>⬇ Export CSV</button></div>
      <Card pad={false}><Async state={state}>{(rows) => rows.length === 0 ? <Empty>Everything is complete 🎉</Empty> : <div className="table-wrap"><table>
        <thead><tr><th>Order</th><th>Customer</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th>Next step</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.order_id}><td><Link to={`/orders/${r.order_id}`}>{r.order_no}</Link></td><td>{r.customer_name}</td><td className="num">{money(r.total)}</td><td className="num">{money(r.paid)}</td>
          <td className="num">{money(r.balance)}</td><td><Badge status="pending">{r.next_step}</Badge></td></tr>)}</tbody></table></div>}</Async></Card>
    </div>
  );
}

function Payouts() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const state = useAsync(() => get(`/reports/payouts?month=${month}`), [month]);
  const { run, busy } = useAction();
  return (
    <div className="stack">
      <div className="toolbar" style={{ margin: 0 }}><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ minWidth: 160 }} />
        <button className="btn" disabled={busy} onClick={async () => { if (await run(() => post('/reports/payouts/generate', { month }), 'Payouts calculated')) state.reload(); }}>Calculate payouts</button>
        <button className="btn secondary" onClick={() => download('/reports/export/payouts.csv', 'payouts.csv')}>⬇ Export CSV</button></div>
      <Card pad={false}><Async state={state}>{(rows) => <div className="table-wrap"><table>
        <thead><tr><th>Technician</th><th className="num">Jobs</th><th className="num">Hours</th><th className="num">Rate/hr</th><th className="num">Amount due</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.user_id}><td>{r.name}</td><td className="num">{r.jobs}</td><td className="num">{r.hours}</td><td className="num">{money(r.hourly_rate)}</td><td className="num"><b>{money(r.amount)}</b></td>
          <td>{r.payout ? <Badge status={r.payout.status} /> : <span className="muted small">not calculated</span>}</td>
          <td className="right">{r.payout?.status === 'pending' && <button className="btn sm ok" onClick={async () => { if (await run(() => post(`/reports/payouts/${r.payout.id}/pay`), 'Marked paid')) state.reload(); }}>Mark paid</button>}</td></tr>)}</tbody></table></div>}</Async></Card>
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('profit');
  return (
    <>
      <PageHead title="Profit & reports" sub="Which installations made money, what is unfinished, and what to pay technicians" />
      <Tabs value={tab} onChange={setTab} tabs={[['profit', 'Job profitability'], ['unfinished', 'Unfinished work'], ['payouts', 'Technician payouts']]} />
      {tab === 'profit' && <Profit />}{tab === 'unfinished' && <Unfinished />}{tab === 'payouts' && <Payouts />}
    </>
  );
}
