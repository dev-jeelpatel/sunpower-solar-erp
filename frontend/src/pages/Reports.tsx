import { useState } from 'react';
import { Link } from 'react-router-dom';
import { download, get, post } from '../api';
import { Async, Badge, Card, Empty, PageHead, Stat, Tabs, money, useAction, useAsync, useToast } from '../components/ui';
import { Chips, Kpi, KpiRow, Meter, Person, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';

function Profit() {
  const [result, setResult] = useState('');
  const state = useAsync(() => get(`/reports/profitability?result=${result}`), [result]);
  return (
    <Async state={state}>{(d) => {
      const margin = d.summary.revenue ? Math.round((d.summary.profit / d.summary.revenue) * 100) : 0;
      return (
        <div className="page-stack">
          <KpiRow>
            <Kpi icon="wallet" tone="indigo" label="Revenue booked" value={money(d.summary.revenue)} sub={`${d.items.length} installations`} />
            <Kpi icon="trend" tone={d.summary.profit < 0 ? 'rose' : 'violet'} label="Profit after costs" value={money(d.summary.profit)} sub={`${margin}% margin after materials and labour`} />
            <Kpi icon="check" tone="green" label="Made money" value={d.summary.profitable} sub="installations in profit" />
            <Kpi icon="alert" tone={d.summary.losing ? 'rose' : 'amber'} label="Lost money" value={d.summary.losing} sub={d.summary.losing ? 'installations in loss' : 'none in loss'} />
          </KpiRow>
          <div className="row between">
            <Chips value={result} onChange={setResult} options={[{ value: '', label: 'All installations' }, { value: 'profit', label: 'Made money', color: '#16a34a' }, { value: 'loss', label: 'Lost money', color: '#ef4444' }]} />
            <button className="btn secondary" onClick={() => download('/reports/export/profitability.csv', 'profitability.csv')}><Icon n="arrow" />Export CSV</button>
          </div>
          <Card pad={false}>{d.items.length === 0 ? <Empty>No jobs.</Empty> : <div className="table-wrap"><table>
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th className="num">Revenue</th><th className="num">Materials</th><th className="num">Labour</th><th className="num">Profit</th><th style={{ width: 170 }}>Margin</th></tr></thead>
            <tbody>{d.items.map((r) => (
              <tr key={r.order_id}>
                <td><Link to={`/orders/${r.order_id}`}><b>{r.order_no}</b></Link></td>
                <td><Person name={r.customer_name} /></td>
                <td><Badge status={r.order_status} /></td>
                <td className="num"><span className="amt">{money(r.revenue)}</span></td>
                <td className="num">{money(r.material_cost)}</td>
                <td className="num">{money(r.labour_cost)}<span className="sub-line">{r.labour_hours}h worked</span></td>
                <td className="num"><span className={`amt ${r.profit < 0 ? 'bad' : 'good'}`}>{money(r.profit)}</span></td>
                <td><Meter value={Math.max(Number(r.margin_pct), 0)} max={50} tone={r.profit < 0 ? 'rose' : Number(r.margin_pct) >= 20 ? 'green' : 'amber'} caption={`${r.margin_pct}%`} /></td>
              </tr>))}</tbody>
          </table></div>}</Card>
          <p className="muted small">Materials use each item's cost at the time of quoting; labour is technician hours × hourly rate from the signed-off job. Unfinished jobs show 0 labour so far.</p>
        </div>
      );
    }}</Async>
  );
}

function Unfinished() {
  const state = useAsync(() => get('/reports/unfinished'));
  return (
    <Async state={state}>{(rows: any[]) => {
      const total = rows.reduce((a, r) => a + Number(r.total), 0);
      const paid = rows.reduce((a, r) => a + Number(r.paid), 0);
      return (
        <div className="page-stack">
          <KpiRow>
            <Kpi icon="box" tone="amber" label="Unfinished orders" value={rows.length} sub="not yet complete" />
            <Kpi icon="doc" tone="indigo" label="Total value" value={money(total)} sub="of unfinished work" />
            <Kpi icon="wallet" tone="green" label="Collected so far" value={money(paid)} sub={total ? `${Math.round((paid / total) * 100)}% of value` : ''} />
            <Kpi icon="clock" tone="rose" label="Balance to collect" value={money(total - paid)} sub="still outstanding" />
          </KpiRow>
          <div><button className="btn secondary" onClick={() => download('/reports/export/unfinished.csv', 'unfinished-orders.csv')}><Icon n="arrow" />Export CSV</button></div>
          <Card pad={false}>{rows.length === 0 ? <Empty>Everything is complete.</Empty> : <div className="table-wrap"><table>
            <thead><tr><th>Order</th><th>Customer</th><th className="num">Total</th><th style={{ width: 190 }}>Paid</th><th className="num">Balance</th><th>Next step</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.order_id}>
                <td><Link to={`/orders/${r.order_id}`}><b>{r.order_no}</b></Link></td>
                <td><Person name={r.customer_name} /></td>
                <td className="num"><span className="amt">{money(r.total)}</span></td>
                <td><Meter value={Number(r.paid)} max={Number(r.total)} tone="indigo" caption={money(r.paid)} /></td>
                <td className="num"><span className="amt bad">{money(r.balance)}</span></td>
                <td><Tag tone="amber">{r.next_step}</Tag></td>
              </tr>))}</tbody></table></div>}</Card>
        </div>
      );
    }}</Async>
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
