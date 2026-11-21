import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get } from '../api';
import { useAuth } from '../auth';
import { money } from '../components/ui';
import '../site.css';
import '../grid-guide.css';

const ICONS: Record<string, string> = {
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
  check: 'M20 6 9 17l-5-5',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  bank: 'M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M12 3 2 9h20z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  battery: 'M2 8h16v8H2zM22 11v2M6 11v2M10 11v2',
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
};
const Ico = ({ n }: { n: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[n]} /></svg>
);

interface Pkg { id: number; kind: 'on_grid' | 'off_grid'; capacity_kw: number; list_price: number }
const GST = 0.05;
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ---------------------------------------------------------------- content
const SYSTEMS = {
  on_grid: {
    name: 'On-grid', tag: 'Most homes choose this', icon: 'bolt',
    line: 'Solar and the electricity grid work together.',
    how: 'Your panels power the house in the day. If they make more than you use, the extra goes to the grid and is credited on your bill. At night, or on a cloudy day, the grid fills the gap.',
    flow: ['Sun', 'Solar panels', 'Inverter', 'Your home', 'Grid'],
    pros: ['Lowest upfront cost, because there are no batteries', 'Eligible for the government subsidy (up to ₹78,000)', 'Extra power earns credit through net metering', 'Almost no upkeep'],
    cons: ['Switches off during a grid power cut, for safety', 'Needs a working electricity connection'],
    best: 'Homes in towns and cities with steady power that want the lowest bill and the fastest payback.',
  },
  off_grid: {
    name: 'Off-grid', tag: 'Independent of the grid', icon: 'battery',
    line: 'A self-contained system that stores its own power.',
    how: 'Your panels charge a battery bank through a charge controller. The batteries power the house any time, day or night, even with no electricity connection at all.',
    flow: ['Sun', 'Solar panels', 'Charge controller', 'Batteries', 'Inverter', 'Your home'],
    pros: ['Keeps working through power cuts', 'Works where there is no grid at all', 'Full control over your own supply'],
    cons: ['Costs more, mainly because of the batteries', 'Batteries wear out and need replacing over the years', 'Usually not eligible for the government subsidy'],
    best: 'Farms, remote homes, and places with long or frequent power cuts.',
  },
} as const;

const COMPARE: [string, string, string][] = [
  ['Needs an electricity connection', 'Yes', 'No'],
  ['Batteries', 'Not needed', 'Yes'],
  ['During a power cut', 'Solar switches off too', 'Keeps running'],
  ['Extra power', 'Credited on your bill', 'Stored in the batteries'],
  ['Government subsidy', 'Up to ₹78,000', 'Usually not available'],
  ['Upfront cost', 'Lower', 'Higher'],
  ['Upkeep', 'Very little', 'Battery replacement over time'],
  ['Typical payback', 'About 3 to 5 years', 'Longer'],
];

const BASICS: [string, string, string][] = [
  ['sun', 'Solar power', 'Panels on your roof turn sunlight into electricity. An inverter makes it usable for your fans, fridge and lights. As a guide, each kW of panels gives about 4 units a day.'],
  ['bolt', 'The grid', 'The public electricity network that supplies your home today. The meter on your wall counts what you take from it, and that is what you pay for.'],
  ['home', 'Why it matters', 'Whether your system stays connected to the grid decides its cost, whether it works in a power cut, and whether you get the subsidy.'],
];

const FAQ: [string, string][] = [
  ['Will an on-grid system work during a power cut?', 'No. For the safety of line workers, an on-grid inverter switches off when the grid goes down. If you need power during cuts, an off-grid system with batteries is the right choice.'],
  ['Can I start on-grid and add batteries later?', 'Our packages are designed as either on-grid or off-grid. If backup matters to you, tell our advisor at the survey so the right system is planned from the start.'],
  ['How long do batteries last?', 'Batteries are the part that wears out. With good care they last several years, and they will need replacing during the life of the system. Panels carry a 20-year warranty.'],
  ['Which one gets the government subsidy?', 'The PM Surya Ghar subsidy applies to grid-connected (on-grid) rooftop systems. We prepare and track the paperwork for you.'],
];

// ---------------------------------------------------------------- verdict
type Answers = { grid: string; cuts: string; goal: string; subsidy: string };
const QUESTIONS: { key: keyof Answers; q: string; opts: [string, string][] }[] = [
  { key: 'grid', q: 'Does your home have a working electricity connection?', opts: [['yes', 'Yes'], ['no', 'No grid connection']] },
  { key: 'cuts', q: 'How often does your power go out?', opts: [['rare', 'Rarely'], ['some', 'Now and then'], ['often', 'Often, for long hours']] },
  { key: 'goal', q: 'What matters most to you?', opts: [['bill', 'The lowest bill'], ['both', 'Both equally'], ['backup', 'Power during cuts']] },
  { key: 'subsidy', q: 'Do you want the government subsidy?', opts: [['yes', 'Yes'], ['no', 'Not important']] },
];

function decide(a: Answers) {
  if (a.grid === 'no') {
    return { type: 'off_grid' as const, on: 0, off: 100, close: false, reasons: ['You have no grid connection, and an off-grid system is the only one that works without it.'] };
  }
  let on = 0, off = 0;
  const reasons: string[] = [];
  if (a.cuts === 'rare') { on += 2; reasons.push('Your power is mostly steady, so you will rarely miss backup.'); }
  if (a.cuts === 'some') { on += 1; off += 1; reasons.push('Occasional cuts matter, but not enough to pay for batteries on their own.'); }
  if (a.cuts === 'often') { off += 2; reasons.push('Long, frequent power cuts are where batteries earn their cost.'); }
  if (a.goal === 'bill') { on += 2; reasons.push('You want the lowest bill, and on-grid gives the fastest payback.'); }
  if (a.goal === 'both') { on += 1; off += 1; }
  if (a.goal === 'backup') { off += 2; reasons.push('Keeping the lights on during cuts is your priority.'); }
  if (a.subsidy === 'yes') { on += 2; reasons.push('The government subsidy applies to on-grid systems.'); }
  const total = on + off || 1;
  const onPct = Math.round((on / total) * 100);
  const close = Math.abs(on - off) <= 1;
  const type = (off > on ? 'off_grid' : 'on_grid') as 'on_grid' | 'off_grid';
  // the subsidy only helps the on-grid case; for off-grid, say plainly that it is the trade-off
  const shown = reasons.map((x) => (type === 'off_grid' && x.startsWith('The government subsidy') ? 'The trade-off: off-grid systems usually do not qualify for the government subsidy.' : x));
  return { type, on: onPct, off: 100 - onPct, close, reasons: shown };
}

function Verdict({ pkgs }: { pkgs: Pkg[] }) {
  const nav = useNavigate();
  const [a, setA] = useState<Partial<Answers>>({});
  const answered = QUESTIONS.filter((q) => a[q.key]).length;
  const done = a.grid === 'no' ? !!a.grid : answered === QUESTIONS.length;
  const r = useMemo(() => (done ? decide({ grid: 'yes', cuts: 'rare', goal: 'both', subsidy: 'no', ...a } as Answers) : null), [a, done]);
  const price = (t: string) => { const p = pkgs.find((x) => x.kind === t && x.capacity_kw === 3); return p ? money(Math.round(p.list_price * (1 + GST))) : null; };
  const visible = a.grid === 'no' ? QUESTIONS.slice(0, 1) : QUESTIONS;

  return (
    <section id="verdict" className="sec dark"><div className="wrap">
      <div className="sec-head light rv"><span className="eyebrow">Our verdict</span><h2>Which one should you choose?</h2><p>Answer four quick questions and we will tell you which system fits your home, and why.</p></div>
      <div className="gg-verdict">
        <div className="gg-qs">
          {visible.map((q, i) => (
            <div key={q.key} className="gg-q">
              <b><i>{i + 1}</i>{q.q}</b>
              <div className="gg-opts" role="radiogroup" aria-label={q.q}>{q.opts.map(([v, l]) => (
                <button key={v} role="radio" aria-checked={a[q.key] === v} className={a[q.key] === v ? 'on' : ''} onClick={() => setA({ ...a, [q.key]: v })}>{l}</button>
              ))}</div>
            </div>
          ))}
          {answered > 0 && <button className="gg-reset" onClick={() => setA({})}>Start again</button>}
        </div>

        <aside className={`gg-result ${r ? 'ready' : ''}`} aria-live="polite">
          {!r ? (
            <div className="gg-wait"><span><Ico n="sun" /></span><b>Your verdict appears here</b><p>{answered} of {a.grid === 'no' ? 1 : QUESTIONS.length} answered</p>
              <div className="gg-prog"><i style={{ width: `${(answered / (a.grid === 'no' ? 1 : QUESTIONS.length)) * 100}%` }} /></div></div>
          ) : (
            <>
              <span className="gg-badge">{r.close ? 'A close call' : 'Our recommendation'}</span>
              <h3>{r.type === 'on_grid' ? 'On-grid system' : 'Off-grid system'}</h3>
              <div className="gg-bars" aria-label="Fit score">
                <div><span>On-grid</span><em><i className="on" style={{ width: `${r.on}%` }} /></em><b>{r.on}%</b></div>
                <div><span>Off-grid</span><em><i className="off" style={{ width: `${r.off}%` }} /></em><b>{r.off}%</b></div>
              </div>
              <ul>{r.reasons.map((x) => <li key={x}><Ico n="check" />{x}</li>)}</ul>
              {r.close && <p className="gg-note">Your answers sit between the two. Our advisor will check your roof and power supply at the free survey and confirm the best fit.</p>}
              {r.type === 'on_grid' && a.cuts === 'often' && <p className="gg-note">Remember: on-grid stops during a grid power cut.</p>}
              <div className="gg-price">A 3 kW {r.type === 'on_grid' ? 'on-grid' : 'off-grid'} system is about <b>{price(r.type) || '-'}</b> incl. GST{r.type === 'on_grid' ? ', before the subsidy of up to ₹78,000' : ''}.</div>
              <button className="s-btn primary block" onClick={() => nav(`/home?type=${r.type}&kw=3#quote`)}>Get a free {r.type === 'on_grid' ? 'on-grid' : 'off-grid'} quote</button>
            </>
          )}
        </aside>
      </div>
    </div></section>
  );
}

// ---------------------------------------------------------------- page
function GuideNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <header className="site-nav scrolled">
      <div className="wrap row between">
        <Link to="/home" className="site-logo"><span><Ico n="sun" /></span>SunPower<b>Solutions</b></Link>
        <nav className={open ? 'open' : ''} aria-label="Website" onClick={() => setOpen(false)}>
          <Link to="/home#how">How it works</Link>
          <Link to="/home#solutions">Solutions</Link>
          <Link to="/home#savings">Savings</Link>
          <Link to="/home#subsidy">Subsidy</Link>
          <Link to="/grid-guide" className="here" aria-current="page">Grid guide</Link>
          <Link to="/home#faq">FAQ</Link>
          <Link className="staff" to={user ? '/' : '/login'}>{user ? 'Open dashboard' : 'Staff login'}</Link>
          <Link className="cta" to="/home#quote">Get free quote</Link>
        </nav>
        <button className="burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><span /><span /><span /></button>
      </div>
    </header>
  );
}

function Flow({ items }: { items: readonly string[] }) {
  return <ol className="gg-flow">{items.map((n, i) => <li key={n} className={i === 0 ? 'sunny' : ''}><span>{n}</span>{i < items.length - 1 && <i aria-hidden="true">→</i>}</li>)}</ol>;
}

function SystemCard({ k, pkgs }: { k: 'on_grid' | 'off_grid'; pkgs: Pkg[] }) {
  const s = SYSTEMS[k];
  const p = pkgs.find((x) => x.kind === k && x.capacity_kw === 3);
  return (
    <article className={`gg-sys rv ${k}`}>
      <header>
        <span className="ic"><Ico n={s.icon} /></span>
        <div><h3>{s.name}</h3><small>{s.tag}</small></div>
      </header>
      <p className="lead">{s.line}</p>
      <p>{s.how}</p>
      <Flow items={s.flow} />
      <div className="gg-cols">
        <div><h4>Advantages</h4><ul className="pro">{s.pros.map((x) => <li key={x}><Ico n="check" />{x}</li>)}</ul></div>
        <div><h4>Things to know</h4><ul className="con">{s.cons.map((x) => <li key={x}><Ico n="alert" />{x}</li>)}</ul></div>
      </div>
      <div className="gg-best"><b>Best for</b> {s.best}</div>
      {p && <div className="gg-from">3 kW from <b>{money(Math.round(p.list_price * (1 + GST)))}</b><small> incl. GST</small></div>}
    </article>
  );
}

export default function GridGuide() {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  useEffect(() => { get<Pkg[]>('/public/packages').then(setPkgs).catch(() => setPkgs([])); }, []);
  useEffect(() => {
    document.title = 'On-grid vs off-grid solar | SunPower Solutions';
    window.scrollTo(0, 0);
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.12 });
    const t = setTimeout(() => document.querySelectorAll('.site .rv').forEach((el) => io.observe(el)), 50);
    return () => { clearTimeout(t); io.disconnect(); document.title = 'SunPower Solar ERP'; };
  }, []);
  const { user } = useAuth();
  const nav = useNavigate();

  return (
    <div className="site gg">
      <GuideNav />

      <section className="gg-hero">
        <div className="wrap">
          <nav className="gg-crumb" aria-label="Breadcrumb"><Link to="/home">Home</Link><span>/</span><b>Grid guide</b></nav>
          <span className="eyebrow">Grid guide</span>
          <h1>On-grid or off-grid? Choose with confidence.</h1>
          <p>Two ways to go solar, and the right one depends on your power supply and what you want from it. Here is the difference in plain words, and a verdict for your home.</p>
          <div className="gg-hero-cta">
            <button className="s-btn primary" onClick={() => scrollTo('verdict')}>Find my match</button>
            <button className="s-btn ghost" onClick={() => scrollTo('compare')}>Compare side by side</button>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head rv"><span className="eyebrow">The basics</span><h2>Three things to know first</h2></div>
          <div className="gg-basics">{BASICS.map(([i, t, d]) => (
            <article key={t} className="rv"><span className="ic"><Ico n={i} /></span><h3>{t}</h3><p>{d}</p></article>
          ))}</div>
        </div>
      </section>

      <section id="systems" className="sec alt">
        <div className="wrap">
          <div className="sec-head rv"><span className="eyebrow">The two systems</span><h2>How each one works</h2><p>Prices are indicative, from our current price list for a 3 kW home system.</p></div>
          <div className="gg-systems"><SystemCard k="on_grid" pkgs={pkgs} /><SystemCard k="off_grid" pkgs={pkgs} /></div>
        </div>
      </section>

      <section id="compare" className="sec">
        <div className="wrap">
          <div className="sec-head rv"><span className="eyebrow">Side by side</span><h2>The differences at a glance</h2></div>
          <div className="gg-table rv"><table>
            <thead><tr><th /><th>On-grid</th><th>Off-grid</th></tr></thead>
            <tbody>{COMPARE.map(([k, a, b]) => <tr key={k}><th scope="row">{k}</th><td data-l="On-grid">{a}</td><td data-l="Off-grid">{b}</td></tr>)}</tbody>
          </table></div>
          <p className="gg-fine rv">Payback is an estimate for a typical home and depends on your bill, roof and subsidy. Your exact figures come after the free roof survey.</p>
        </div>
      </section>

      <Verdict pkgs={pkgs} />

      <section className="sec">
        <div className="wrap narrow">
          <div className="sec-head rv"><span className="eyebrow">Common questions</span><h2>Before you decide</h2></div>
          <div className="gg-faq">{FAQ.map(([q, a]) => (
            <details key={q} className="rv"><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>
          ))}</div>
        </div>
      </section>

      <section className="cta-band"><div className="wrap cta-row">
        <div><h2>Not sure yet? We will help you decide.</h2><p>A free roof survey checks your roof and your power supply, then we recommend the right system. No cost, no obligation.</p></div>
        <button className="s-btn primary" onClick={() => nav('/home#quote')}>Get my free quote</button>
      </div></section>

      <footer className="site-foot">
        <div className="wrap copy" style={{ paddingTop: 0 }}>
          <span>© {new Date().getFullYear()} SunPower Solutions. All rights reserved.</span>
          <span><Link to="/home">Home</Link> · <Link to={user ? '/' : '/login'}>{user ? 'Open dashboard' : 'Staff login'}</Link></span>
        </div>
      </footer>
    </div>
  );
}
