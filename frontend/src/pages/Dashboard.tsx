import RevenueChart from '../components/RevenueChart';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { useCurrentUser } from '../auth';
import { Icon, type IconName } from '../components/icons';
import { Async, Empty, Seg, label, money, useAsync } from '../components/ui';

const PIPE_ORDER = ['new', 'contacted', 'qualified', 'survey_scheduled', 'survey_approved', 'quoted', 'won', 'lost'];
const PIPE_TONE: Record<string, string> = {
  new: '#c7d2fe', contacted: '#a5b4fc', qualified: '#818cf8', survey_scheduled: '#6366f1',
  survey_approved: '#4f46e5', quoted: '#4338ca', won: '#16a34a', lost: '#ef4444',
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

const PIPE_STAGES: [string, string][] = [
  ['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['survey_scheduled', 'Survey booked'],
  ['survey_approved', 'Survey approved'], ['quoted', 'Quote sent'], ['won', 'Won'], ['lost', 'Lost'],
];
const OPEN_STAGES = PIPE_STAGES.slice(0, 6);

/**
 * Sales pipeline. The ring shows where every enquiry ended up; the tiles split it into in progress, won and lost;
 * and the bars below show how the open ones are spread across the stages (a click opens the enquiries at that stage).
 */
function Pipeline({ data }: { data: { status: string; n: number }[] }) {
  const [hot, setHot] = useState<string | null>(null);
  const nOf = (s: string) => data.find((p) => p.status === s)?.n || 0;
  const total = data.reduce((a, b) => a + b.n, 0);
  if (total === 0) return <Empty>No enquiries yet</Empty>;

  const won = nOf('won'), lost = nOf('lost');
  const open = OPEN_STAGES.reduce((a, [s]) => a + nOf(s), 0);
  const decided = won + lost;
  const winRate = decided ? Math.round((won / decided) * 100) : 0;
  const pct = (n: number) => (n / total) * 100;
  const maxOpen = Math.max(...OPEN_STAGES.map(([s]) => nOf(s)), 1);

  const R = 46;
  const C = 2 * Math.PI * R;
  const GAP = 2;
  let acc = 0;
  const segs = PIPE_STAGES.filter(([s]) => nOf(s) > 0).map(([s, l]) => {
    const frac = nOf(s) / total;
    const len = Math.max(frac * C - GAP, 1.2);
    const seg = { s, l, len, offset: -acc };
    acc += frac * C;
    return seg;
  });
  const hotStage = hot ? PIPE_STAGES.find(([s]) => s === hot) : null;

  const tiles: { key: string; to: string; label: string; n: number; tone: string; sub: string }[] = [
    { key: 'open', to: '/enquiries', label: 'In progress', n: open, tone: '#6366f1', sub: `${pct(open).toFixed(0)}% of all enquiries` },
    { key: 'won', to: '/enquiries?status=won', label: 'Won', n: won, tone: '#16a34a', sub: `${pct(won).toFixed(0)}% of all enquiries` },
    { key: 'lost', to: '/enquiries?status=lost', label: 'Lost', n: lost, tone: '#ef4444', sub: `${pct(lost).toFixed(0)}% of all enquiries` },
  ];

  return (
    <div className="pl2-wrap"><div className="pl2">
      <div className="pl2-ring">
        <svg viewBox="0 0 120 120" role="img" aria-label="Enquiries by stage">
          <circle cx="60" cy="60" r={R} fill="none" stroke="#eef1f7" strokeWidth="13" />
          <g transform="rotate(-90 60 60)">
            {segs.map((g, i) => (
              <circle
                key={g.s} cx="60" cy="60" r={R} fill="none" stroke={PIPE_TONE[g.s]} strokeLinecap="round"
                strokeWidth={hot === g.s ? 17 : 13} strokeDasharray={`${g.len} ${C - g.len}`} strokeDashoffset={g.offset}
                opacity={hot && hot !== g.s ? 0.3 : 1} className="dn-seg" style={{ animationDelay: `${i * 70}ms`, '--c': C } as any}
                onMouseEnter={() => setHot(g.s)} onMouseLeave={() => setHot(null)}
              />
            ))}
          </g>
        </svg>
        <div className="dn-mid">
          <b>{hotStage ? nOf(hotStage[0]) : total}</b>
          <span>{hotStage ? hotStage[1] : 'enquiries'}</span>
          {hotStage ? <em>{pct(nOf(hotStage[0])).toFixed(0)}% of all</em> : <em title="Won out of all the enquiries that ended in a yes or a no">{winRate}% win rate</em>}
        </div>
      </div>

      <div className="pl2-side">
        <div className="pl2-tiles">
          {tiles.map((t) => (
            <Link key={t.key} to={t.to} className="pl2-tile" style={{ '--c': t.tone } as any}>
              <span><i />{t.label}</span>
              <b>{t.n.toLocaleString('en-IN')}</b>
              <small>{t.sub}</small>
            </Link>
          ))}
        </div>

        <div className="pl2-stages">
          <h3>In progress by stage</h3>
          <ul>
            {OPEN_STAGES.map(([s, l]) => {
              const n = nOf(s);
              return (
                <li key={s} className={`${hot === s ? 'on' : ''} ${n === 0 ? 'zero' : ''}`} onMouseEnter={() => setHot(s)} onMouseLeave={() => setHot(null)}>
                  <Link to={`/enquiries?status=${s}`}>
                    <span className="pl2-name"><i style={{ background: PIPE_TONE[s] }} />{l}</span>
                    <span className="pl2-bar"><u style={{ width: `${(n / maxOpen) * 100}%`, background: PIPE_TONE[s] }} /></span>
                    <b>{n}</b>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="pl2-foot">Win rate <b>{winRate}%</b> of {decided.toLocaleString('en-IN')} decided enquiries ({won.toLocaleString('en-IN')} won, {lost.toLocaleString('en-IN')} lost)</p>
        </div>
      </div>
    </div></div>
  );
}

export default function Dashboard() {
  const user = useCurrentUser();
  const [period, setPeriod] = useState('month');
  const state = useAsync(() => get(`/reports/dashboard?period=${period}`), [period]);
  const mgmt = ['director', 'admin'].includes(user.role);
  const words = ({ today: 'today', week: 'this week', month: 'this month' } as Record<string, string>)[period];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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

            <div className="grid split">
              <section className="card dcard">
                <div className="dcard-head"><div><h2>Revenue</h2><p>Cash collected and new orders booked, month by month</p></div></div>
                <RevenueChart data={d.trend} />
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
                <div className="dcard-head"><div><h2>Sales pipeline</h2><p>How enquiries move from first contact to a won order</p></div><Link to="/enquiries" className="dlink">All enquiries<Icon n="arrow" /></Link></div>
                <Pipeline data={d.pipeline} />
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
