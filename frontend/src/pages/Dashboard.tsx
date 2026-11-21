import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { useCurrentUser } from '../auth';
import { Async, Card, PageHead, Seg, Stat, useAsync, money, label, Empty } from '../components/ui';

const PIPE_ORDER = ['new', 'contacted', 'qualified', 'survey_scheduled', 'survey_approved', 'quoted', 'won', 'lost'];

function Bars({ data }) {
  const max = Math.max(...data.map((d) => d.collected), 1);
  return (
    <div className="bars" role="img" aria-label="Collections for the last six months">
      {data.map((d) => (
        <div className="bar" key={d.label}>
          <span>{d.collected ? money(d.collected / 1000) + 'k' : ''}</span>
          <i style={{ height: `${(d.collected / max) * 100}%` }} title={money(d.collected)} />
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const user = useCurrentUser();
  const [period, setPeriod] = useState('month');
  const state = useAsync(() => get(`/reports/dashboard?period=${period}`), [period]);
  const mgmt = ['director', 'admin'].includes(user.role);
  const words = { today: 'today', week: 'this week', month: 'this month' }[period];

  return (
    <>
      <PageHead title={`Hello, ${user.name.split(' ')[0]}`} sub="How SunPower is doing" actions={
        <Seg value={period} onChange={setPeriod} options={[['today', 'Today'], ['week', 'This week'], ['month', 'This month']]} />} />
      <Async state={state}>{(d) => (
        <div className="stack">
          <div className="grid g4">
            <Stat label={`Cash collected ${words}`} value={money(d.kpi.collections)} sub={`${money(d.receivables)} still to collect`} />
            <Stat label="New enquiries" value={d.kpi.new_enquiries} sub={`${d.kpi.quotes_created} quotes, ${d.kpi.orders_booked} orders booked`} />
            <Stat label="Installations signed off" value={d.kpi.installations_done} sub={`${d.unfinishedOrders} orders still unfinished`} tone="good" />
            {mgmt ? <Stat label={`Profit on completed jobs`} value={money(d.kpi.profit)} sub={`on ${money(d.kpi.revenue_completed)} revenue`} tone={d.kpi.profit < 0 ? 'bad' : 'good'} />
              : <Stat label="Open service tickets" value={d.tickets.open} sub={`${d.tickets.urgent} high priority`} tone={d.tickets.urgent ? 'bad' : 'accent'} />}
          </div>

          <div className="grid split">
            <Card title="Collections, last 6 months"><Bars data={d.trend} /></Card>
            <Card title="Needs attention" pad={false}>
              <div className="table-wrap"><table><tbody>
                <tr><td><Link to="/tickets">Open service tickets</Link></td><td className="num"><b>{d.tickets.open}</b></td></tr>
                <tr><td><Link to="/orders">Unfinished orders</Link></td><td className="num"><b>{d.unfinishedOrders}</b></td></tr>
                <tr><td><Link to="/subsidies">Subsidy files open</Link></td><td className="num"><b>{d.subsidy.open}</b> <span className="muted small">({money(d.subsidy.expected)})</span></td></tr>
                <tr><td><Link to="/inventory">Low-stock items</Link></td><td className="num"><b>{d.lowStock.length}</b></td></tr>
              </tbody></table></div>
            </Card>
          </div>

          <div className="grid g2">
            <Card title="Sales pipeline">
              {d.pipeline.length === 0 ? <Empty>No enquiries yet</Empty> : (
                <div className="stack" style={{ gap: 10 }}>
                  {PIPE_ORDER.map((s) => {
                    const n = d.pipeline.find((p) => p.status === s)?.n || 0;
                    const total = d.pipeline.reduce((a, b) => a + b.n, 0);
                    return (
                      <div key={s}><div className="row between small"><span style={{ textTransform: 'capitalize' }}>{label(s)}</span><b>{n}</b></div>
                        <div className="progress"><i style={{ width: `${(n / total) * 100}%`, background: s === 'lost' ? 'var(--bad)' : undefined }} /></div></div>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card title="Low stock" pad={false}>
              {d.lowStock.length === 0 ? <Empty>All stock levels are healthy ✅</Empty> : (
                <div className="table-wrap"><table><thead><tr><th>Item</th><th className="num">On hand</th><th className="num">Reorder at</th></tr></thead>
                  <tbody>{d.lowStock.map((s) => <tr key={s.sku}><td>{s.name}</td><td className="num"><b style={{ color: 'var(--bad)' }}>{s.on_hand}</b></td><td className="num">{s.reorder_level}</td></tr>)}</tbody></table></div>
              )}
            </Card>
          </div>
        </div>
      )}</Async>
    </>
  );
}
