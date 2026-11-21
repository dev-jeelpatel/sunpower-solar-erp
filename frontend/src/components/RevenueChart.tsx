import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from './ui';

export interface MonthPoint { month: string; label: string; collected: number; billed: number; orders: number }

/** ₹ in lakh / crore, the way people read money in India. */
const short = (n: number) => (n >= 1e7 ? `${+(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
const pctChange = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

/** A round top for the y-axis, so the grid lines land on friendly numbers. */
function niceMax(max: number) {
  if (max <= 0) return 4;
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  return step * 4;
}

/** A smooth line through the points, flat at each point so it never overshoots. */
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return '';
  return pts.reduce((d, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2;
    return `${d} C${mx},${py} ${mx},${y} ${x},${y}`;
  }, '');
}

const RANGES = [3, 6, 12] as const;

/**
 * Cash collected (bars) against the value of new orders (line), month by month.
 * Hover for exact figures; switch the range; the current month is hatched because it is not over yet.
 */
export default function RevenueChart({ data }: { data: MonthPoint[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(6);
  const [show, setShow] = useState({ collected: true, billed: true });
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const nowKey = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const rows = data.slice(-range);
  const prevRows = data.slice(-range * 2, -range);
  const n = rows.length;

  const stats = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.collected, 0);
    const billed = rows.reduce((s, r) => s + r.billed, 0);
    const orders = rows.reduce((s, r) => s + r.orders, 0);
    const complete = rows.filter((r) => r.month.slice(0, 7) !== nowKey);
    const avg = complete.length ? complete.reduce((s, r) => s + r.collected, 0) / complete.length : total / Math.max(n, 1);
    const best = rows.reduce((b, r, i) => (r.collected > rows[b].collected ? i : b), 0);
    const prevTotal = prevRows.length === rows.length ? prevRows.reduce((s, r) => s + r.collected, 0) : null;
    return { total, billed, orders, avg, best, change: prevTotal == null ? null : pctChange(total, prevTotal) };
  }, [rows, prevRows, nowKey, n]);

  // ---- geometry
  const H = 300, m = { l: 54, r: 14, t: 18, b: 34 };
  const iw = w - m.l - m.r, ih = H - m.t - m.b;
  const seriesMax = Math.max(...rows.map((r) => Math.max(show.collected ? r.collected : 0, show.billed ? r.billed : 0)), 1);
  const top = niceMax(seriesMax);
  const x = (i: number) => m.l + (iw / n) * (i + 0.5);
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const band = iw / n;
  const barW = Math.min(Math.max(band * 0.5, 10), 58);
  const ticks = [0, 1, 2, 3, 4].map((i) => (top / 4) * i);
  const linePts = rows.map((r, i) => [x(i), y(r.billed)] as [number, number]);
  const hv = hover == null ? null : rows[hover];
  const hvPrev = hover != null && hover > 0 ? rows[hover - 1] : hover === 0 ? data[data.length - range - 1] : null;
  const dMoM = hv && hvPrev ? pctChange(hv.collected, hvPrev.collected) : null;
  const tipX = hover == null ? 0 : Math.min(Math.max(x(hover), 100), w - 100);

  const Chip = ({ v }: { v: number | null }) => (v == null ? null : <em className={`rc-chip ${v >= 0 ? 'up' : 'down'}`}>{v >= 0 ? '▲' : '▼'} {Math.abs(v).toFixed(0)}%</em>);

  return (
    <div className="rc">
      <div className="rc-kpis">
        <div>
          <span>Collected, last {range} months</span>
          <b>{money(stats.total)}</b>
          <p className="rc-foot">{stats.change != null ? <><Chip v={stats.change} /><small>vs the {range} months before</small></> : <small>No earlier period to compare</small>}</p>
        </div>
        <div>
          <span>New orders booked</span>
          <b>{money(stats.billed)}</b>
          <p className="rc-foot"><small>{stats.orders} order{stats.orders === 1 ? '' : 's'} in {range} months</small></p>
        </div>
        <div>
          <span>Monthly average</span>
          <b>{money(stats.avg)}</b>
          <p className="rc-foot"><small>cash collected, complete months</small></p>
        </div>
      </div>

      <div className="rc-legend">
        <button className={show.collected ? 'on' : ''} onClick={() => setShow({ ...show, collected: !show.collected })} aria-pressed={show.collected}><i className="bar" />Cash collected</button>
        <button className={show.billed ? 'on' : ''} onClick={() => setShow({ ...show, billed: !show.billed })} aria-pressed={show.billed}><i className="line" />New orders booked</button>
        <span className="rc-note"><i className="hatch" />Current month, not over yet</span>
        <div className="rc-range" role="group" aria-label="Time range">
          {RANGES.map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => { setRange(r); setHover(null); }}>{r}M</button>)}
        </div>
      </div>

      <div className="rc-plot" ref={wrap} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} role="img" aria-label={`Cash collected and new orders booked for the last ${range} months`}>
          <defs>
            <linearGradient id="rc-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#4f46e5" /></linearGradient>
            <linearGradient id="rc-bar-hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#3730a3" /></linearGradient>
            <linearGradient id="rc-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f59e0b" stopOpacity=".22" /><stop offset="1" stopColor="#f59e0b" stopOpacity="0" /></linearGradient>
            <pattern id="rc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="#fff" opacity=".35" /></pattern>
            <clipPath id="rc-clip"><rect x={m.l} y={m.t - 6} width={iw} height={ih + 6} /></clipPath>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="#e8ecf4" strokeDasharray={t === 0 ? undefined : '4 5'} />
              <text x={m.l - 10} y={y(t) + 4} textAnchor="end" className="rc-ytx">{t === 0 ? '0' : short(t)}</text>
            </g>
          ))}

          {hover != null && <rect x={x(hover) - band / 2} y={m.t - 6} width={band} height={ih + 6} rx="10" fill="#eef1fe" />}

          {show.collected && stats.avg > 0 && n > 1 && (
            <g>
              <line x1={m.l} x2={w - m.r} y1={y(stats.avg)} y2={y(stats.avg)} stroke="#6366f1" strokeWidth="1.2" strokeDasharray="2 5" opacity=".55" />
              <text x={w - m.r - 4} y={y(stats.avg) - 6} textAnchor="end" className="rc-avg">average {short(stats.avg)}</text>
            </g>
          )}

          {show.collected && rows.map((r, i) => {
            const h = Math.max(ih - (y(r.collected) - m.t), r.collected ? 3 : 0);
            const partial = r.month.slice(0, 7) === nowKey;
            const bx = x(i) - barW / 2;
            return (
              <g key={r.month} className="rc-bar" style={{ animationDelay: `${i * 45}ms`, transformOrigin: `${x(i)}px ${m.t + ih}px` }}>
                <rect x={bx} y={m.t + ih - h} width={barW} height={h} rx="7" fill={hover === i ? 'url(#rc-bar-hot)' : 'url(#rc-bar)'} />
                {partial && <rect x={bx} y={m.t + ih - h} width={barW} height={h} rx="7" fill="url(#rc-hatch)" />}
              </g>
            );
          })}

          {show.collected && stats.total > 0 && n > 2 && barW >= 34 && <text x={x(stats.best)} y={y(rows[stats.best].collected) + 18} textAnchor="middle" className="rc-best">★ Best</text>}

          {show.billed && n > 1 && (
            <g clipPath="url(#rc-clip)">
              <path d={`${smooth(linePts)} L${x(n - 1)},${m.t + ih} L${x(0)},${m.t + ih} Z`} fill="url(#rc-area)" className="rc-fade" />
              <path d={smooth(linePts)} fill="none" stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" className="rc-draw" pathLength={1} />
            </g>
          )}
          {show.billed && rows.map((r, i) => <circle key={r.month} cx={x(i)} cy={y(r.billed)} r={hover === i ? 6 : 4} fill="#fff" stroke="#f59e0b" strokeWidth="2.4" className="rc-dot" />)}

          {rows.map((r, i) => (
            <text key={r.month} x={x(i)} y={H - 10} textAnchor="middle" className={`rc-xtx ${hover === i ? 'on' : ''}`}>{n > 8 ? r.label.replace(/ \d{2}$/, '') : r.label}</text>
          ))}

          {rows.map((r, i) => (
            <rect key={`hit${r.month}`} x={x(i) - band / 2} y={0} width={band} height={H} fill="transparent" tabIndex={0}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${r.label}: collected ${money(r.collected)}, new orders ${money(r.billed)}`} />
          ))}
        </svg>

        {hv && (
          <div className="rc-tip" style={{ left: tipX }}>
            <b>{hv.label}{hv.month.slice(0, 7) === nowKey && <small> so far</small>}</b>
            <div><i className="bar" />Collected<strong>{money(hv.collected)}</strong></div>
            <div><i className="line" />New orders<strong>{money(hv.billed)}</strong></div>
            <div className="rc-tip-foot"><span>{hv.orders} order{hv.orders === 1 ? '' : 's'}</span>{dMoM != null && <span className={dMoM >= 0 ? 'up' : 'down'}>{dMoM >= 0 ? '▲' : '▼'} {Math.abs(dMoM).toFixed(0)}% vs last month</span>}</div>
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>Cash collected and new orders by month</caption>
        <thead><tr><th>Month</th><th>Collected</th><th>New orders</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.month}><td>{r.label}</td><td>{money(r.collected)}</td><td>{money(r.billed)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
