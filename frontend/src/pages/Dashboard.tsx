import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { useCurrentUser } from '../auth';
import { Icon, type IconName } from '../components/icons';
import { Async, Empty, Seg, label, money, useAsync } from '../components/ui';

const PIPE_ORDER = ['new', 'contacted', 'qualified', 'survey_scheduled', 'survey_approved', 'quoted', 'won', 'lost'];
const PIPE_TONE: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', qualified: '#0ea5e9', survey_scheduled: '#14b8a6',
  survey_approved: '#10b981', quoted: '#f59e0b', won: '#16a34a', lost: '#ef4444',
};

type Tone = 'indigo' | 'blue' | 'green' | 'amber' | 'rose' | 'violet';

/** Short rupee label for chart axes: 12k, 1.5L */
const short = (n: number) => (n >= 1e5 ? `${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

function Kpi({ icon, tone, label: l, value, sub }: { icon: IconName; tone: Tone; label: string; value: string | number; sub?: string }) {
  return (
    <div className={`kpi-card t-${tone}`}>
      <span className="kpi-ic"><Icon n={icon} /></span>
      <div className="kpi-body">
        <span className="kpi-label">{l}</span>
        <b className="kpi-value">{value}</b>
        {sub && <span className="kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

/** Bar chart with gridlines, a y-axis and a hover read-out. */
function CollectionsChart({ data }: { data: { label: string; collected: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.collected), 1);
  const top = Math.ceil(max / 10 ** (String(Math.ceil(max)).length - 1)) * 10 ** (String(Math.ceil(max)).length - 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => top * t);
  const total = data.reduce((s, d) => s + d.collected, 0);
  const shown = hover != null ? data[hover] : null;
  return (
    <div className="chart">
      <div className="chart-sum">
        <div><span>{shown ? shown.label : 'Last 6 months'}</span><b>{money(shown ? shown.collected : total)}</b></div>
        <small>{shown ? 'collected that month' : 'total collected'}</small>
      </div>
      <div className="chart-plot" role="img" aria-label="Collections for the last six months">
        <div className="chart-y">{[...ticks].reverse().map((t) => <span key={t}>{short(t)}</span>)}</div>
        <div className="chart-area">
          <div className="chart-grid">{ticks.map((t) => <i key={t} />)}</div>
          <div className="chart-bars">
            {data.map((d, i) => (
              <div key={d.label} className={`cbar ${hover === i ? 'on' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className="cbar-track"><i style={{ height: `${Math.max((d.collected / top) * 100, d.collected ? 3 : 0)}%` }} /></div>
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const QUICK: { to: string; text: string; icon: IconName; roles: string[] }[] = [
  { to: '/enquiries', text: 'Enquiries', icon: 'inbox', roles: ['sales'] },
  { to: '/quotes', text: 'Quotes', icon: 'doc', roles: ['sales'] },
  { to: '/orders', text: 'Orders', icon: 'box', roles: ['sales', 'warehouse'] },
  { to: '/dispatch', text: 'Dispatch', icon: 'truck', roles: ['warehouse'] },
  { to: '/inventory', text: 'Inventory', icon: 'warehouse', roles: ['warehouse'] },
  { to: '/jobs', text: 'My jobs', icon: 'wrench', roles: ['technician'] },
  { to: '/surveys', text: 'Surveys', icon: 'ruler', roles: ['technician'] },
  { to: '/tickets', text: 'Tickets', icon: 'ticket', roles: ['support', 'technician'] },
  { to: '/lookup', text: 'Warranty lookup', icon: 'search', roles: ['support'] },
  { to: '/reports', text: 'Profit & reports', icon: 'chart', roles: ['director'] },
  { to: '/invoices', text: 'Invoices', icon: 'card', roles: ['sales', 'director'] },
  { to: '/customers', text: 'Customers', icon: 'users', roles: ['director', 'support'] },
];

export default function Dashboard() {
  const user = useCurrentUser();
  const [period, setPeriod] = useState('month');
  const state = useAsync(() => get(`/reports/dashboard?period=${period}`), [period]);
  const mgmt = ['director', 'admin'].includes(user.role);
  const words = ({ today: 'today', week: 'this week', month: 'this month' } as Record<string, string>)[period];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const quick = QUICK.filter((q) => user.role === 'admin' || q.roles.includes(user.role)).slice(0, 6);

  return (
    <>
      <div className="dash-head">
        <div>
          <span className="dash-date"><Icon n="calendar" />{date}</span>
          <h1>{hello}, {user.name.split(' ')[0]}</h1>
          <p>Here is how SunPower is doing {words}.</p>
        </div>
        <div className="row">
          <Seg value={period} onChange={setPeriod} options={[['today', 'Today'], ['week', 'This week'], ['month', 'This month']]} />
          <button className="btn secondary sm" onClick={state.reload} title="Refresh"><Icon n="refresh" />Refresh</button>
        </div>
      </div>

      <Async state={state}>{(d) => {
        const totalLeads = d.pipeline.reduce((a: number, b: any) => a + b.n, 0) || 1;
        return (
          <div className="stack" style={{ gap: 18 }}>
            <div className="kpi-grid">
              <Kpi icon="wallet" tone="indigo" label={`Cash collected ${words}`} value={money(d.kpi.collections)} sub={`${money(d.receivables)} still to collect`} />
              <Kpi icon="inbox" tone="blue" label="New enquiries" value={d.kpi.new_enquiries} sub={`${d.kpi.quotes_created} quotes · ${d.kpi.orders_booked} orders booked`} />
              <Kpi icon="wrench" tone="green" label="Installations signed off" value={d.kpi.installations_done} sub={`${d.unfinishedOrders} orders still unfinished`} />
              {mgmt
                ? <Kpi icon="trend" tone={d.kpi.profit < 0 ? 'rose' : 'violet'} label="Profit on completed jobs" value={money(d.kpi.profit)} sub={`on ${money(d.kpi.revenue_completed)} revenue`} />
                : <Kpi icon="ticket" tone={d.tickets.urgent ? 'rose' : 'amber'} label="Open service tickets" value={d.tickets.open} sub={`${d.tickets.urgent} high priority`} />}
            </div>

            {quick.length > 0 && (
              <div className="quick">
                <span><Icon n="zap" />Quick actions</span>
                {quick.map((q) => <Link key={q.to} to={q.to}><Icon n={q.icon} />{q.text}</Link>)}
              </div>
            )}

            <div className="grid split">
              <section className="card dcard">
                <div className="dcard-head"><div><h2>Collections</h2><p>Cash received per month</p></div></div>
                <CollectionsChart data={d.trend} />
              </section>

              <section className="card dcard">
                <div className="dcard-head"><div><h2>Needs attention</h2><p>Jump straight to what is waiting</p></div></div>
                <ul className="attn">
                  {[
                    { to: '/tickets', icon: 'ticket' as IconName, tone: 'rose', text: 'Open service tickets', n: d.tickets.open, note: d.tickets.urgent ? `${d.tickets.urgent} high priority` : '' },
                    { to: '/orders', icon: 'box' as IconName, tone: 'amber', text: 'Unfinished orders', n: d.unfinishedOrders, note: '' },
                    { to: '/subsidies', icon: 'bank' as IconName, tone: 'blue', text: 'Subsidy files open', n: d.subsidy.open, note: d.subsidy.open ? `${money(d.subsidy.expected)} expected` : '' },
                    { to: '/inventory', icon: 'warehouse' as IconName, tone: 'violet', text: 'Low-stock items', n: d.lowStock.length, note: '' },
                  ].map((a) => (
                    <li key={a.to}>
                      <Link to={a.to}>
                        <span className={`attn-ic t-${a.tone}`}><Icon n={a.icon} /></span>
                        <span className="attn-tx"><b>{a.text}</b>{a.note && <small>{a.note}</small>}</span>
                        <span className={`attn-n ${a.n ? 'has' : ''}`}>{a.n}</span>
                        <Icon n="arrow" className="attn-go" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="grid g2">
              <section className="card dcard">
                <div className="dcard-head"><div><h2>Sales pipeline</h2><p>{totalLeads === 1 && !d.pipeline.length ? 'No enquiries yet' : `${d.pipeline.reduce((a: number, b: any) => a + b.n, 0)} enquiries by stage`}</p></div></div>
                {d.pipeline.length === 0 ? <Empty>No enquiries yet</Empty> : (
                  <div className="funnel">
                    {PIPE_ORDER.map((s) => {
                      const n = d.pipeline.find((p: any) => p.status === s)?.n || 0;
                      return (
                        <div key={s} className="funnel-row">
                          <span className="funnel-label">{label(s)}</span>
                          <div className="funnel-track"><i style={{ width: `${Math.max((n / totalLeads) * 100, n ? 4 : 0)}%`, background: PIPE_TONE[s] }} /></div>
                          <b>{n}</b>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="card dcard">
                <div className="dcard-head"><div><h2>Low stock</h2><p>Items at or below their reorder level</p></div><Link to="/inventory" className="dlink">View stock<Icon n="arrow" /></Link></div>
                {d.lowStock.length === 0 ? (
                  <div className="allgood"><span><Icon n="check" /></span><b>All stock levels are healthy</b><small>Nothing needs reordering right now.</small></div>
                ) : (
                  <ul className="stocklist">
                    {d.lowStock.map((s: any) => (
                      <li key={s.sku}>
                        <div className="row between"><b>{s.name}</b><span className="muted small">{s.on_hand} of {s.reorder_level}</span></div>
                        <div className="progress warnbar"><i style={{ width: `${Math.min(100, (s.on_hand / Math.max(s.reorder_level, 1)) * 100)}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        );
      }}</Async>
    </>
  );
}
