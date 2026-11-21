import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { get, ApiError } from '../api';
import EnquiryForm from '../components/EnquiryForm';
import { useAuth } from '../auth';
import { fmtDate, money } from '../components/ui';
import '../site.css';

// ---------- small helpers ----------
const ICONS: Record<string, string> = {
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  roof: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ticket: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 17v2M13 11v2',
  bank: 'M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M12 3 2 9h20z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
  check: 'M20 6 9 17l-5-5',
};
const Ico = ({ n }: { n: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[n]} /></svg>
);
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

interface Pkg { id: number; name: string; kind: 'on_grid' | 'off_grid'; capacity_kw: number; description: string; list_price: number; panels: number }

// Government subsidy (PM Surya Ghar): Rs 30k/kW up to 2 kW, capped at Rs 78k from 3 kW.
const subsidyFor = (kw: number) => (kw >= 3 ? 78000 : kw >= 2 ? 60000 : 30000);
const GST = 0.05;
const TARIFF = 7; // assumed Rs per unit, shown to the user as an assumption
const UNITS_PER_KW_MONTH = 120; // ~4 units a day per kW

// ---------- sections ----------
function Nav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const go = (id: string) => { setOpen(false); scrollTo(id); };
  return (
    <header className="site-nav">
      <div className="wrap row between">
        <Link to="/home" className="site-logo"><span><Ico n="sun" /></span>SunPower<b>Solutions</b></Link>
        <nav className={open ? 'open' : ''} aria-label="Website">
          <button onClick={() => go('how')}>How it works</button>
          <button onClick={() => go('solutions')}>Solutions</button>
          <button onClick={() => go('savings')}>Savings</button>
          <button onClick={() => go('subsidy')}>Subsidy</button>
          <button onClick={() => go('why')}>Why SunPower</button>
          <button onClick={() => go('faq')}>FAQ</button>
          <Link className="staff" to={user ? '/' : '/login'}>{user ? 'Open dashboard' : 'Staff login'}</Link>
          <button className="cta" onClick={() => go('quote')}>Get free quote</button>
        </nav>
        <button className="burger" aria-label="Menu" onClick={() => setOpen((o) => !o)}><span /><span /><span /></button>
      </div>
    </header>
  );
}

type QuotePick = { kw: string; type: string };

function Hero({ sel }: { sel: QuotePick }) {
  return (
    <section className="hero-site">
      <div className="hero-deco" aria-hidden="true">
        <svg viewBox="0 0 420 360">
          <defs>
            <radialGradient id="sg" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></radialGradient>
            <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1e3a8a" /><stop offset="1" stopColor="#0f1f4d" /></linearGradient>
          </defs>
          <circle cx="320" cy="80" r="46" fill="url(#sg)" />
          <g stroke="#fbbf24" strokeWidth="5" strokeLinecap="round">{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1={320 + Math.cos((a * Math.PI) / 180) * 62} y1={80 + Math.sin((a * Math.PI) / 180) * 62} x2={320 + Math.cos((a * Math.PI) / 180) * 80} y2={80 + Math.sin((a * Math.PI) / 180) * 80} />)}</g>
          <path d="M40 330 L40 200 L190 120 L340 200 L340 330 Z" fill="#e2e8f0" />
          <path d="M20 205 L190 112 L360 205 L330 215 L190 138 L50 215 Z" fill="#334155" />
          <g transform="translate(86 150) skewY(-28)">
            {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={c * 38} y={r * 30} width="34" height="26" rx="2" fill="url(#pg)" stroke="#93c5fd" strokeWidth="1" />))}
          </g>
          <rect x="150" y="250" width="60" height="80" rx="4" fill="#94a3b8" /><rect x="64" y="240" width="48" height="40" rx="3" fill="#bfdbfe" /><rect x="264" y="240" width="48" height="40" rx="3" fill="#bfdbfe" />
        </svg>
      </div>
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow">Rooftop solar for Indian homes</span>
          <h1>Turn your roof into a <em>power plant</em>. Cut your electricity bill.</h1>
          <p className="lead">From the first call to a 20-year warranty, SunPower looks after everything: roof survey, clear quote, installation, government subsidy paperwork and after-sales support.</p>
          <div className="row" style={{ gap: 12 }}>
            <button className="s-btn ghost" onClick={() => scrollTo('savings')}>Calculate my savings</button>
            <button className="s-btn ghost" onClick={() => scrollTo('how')}>See how it works</button>
          </div>
          <ul className="ticks">
            <li><Ico n="check" /> 20-year warranty on panels</li>
            <li><Ico n="check" /> Subsidy paperwork handled</li>
            <li><Ico n="check" /> Every part tracked by serial number</li>
          </ul>
        </div>
        <div id="quote" className="hero-form">
          <div className="hero-form-head"><b>Get your free quote</b><span>Free roof survey. No obligation.</span></div>
          <EnquiryForm key={`${sel.kw}-${sel.type}`} compact initialKw={sel.kw} initialType={sel.type} title="" />
        </div>
      </div>
    </section>
  );
}

function Facts() {
  const facts = [['1 – 5 kW', 'Home system sizes'], ['20 years', 'Panel warranty'], ['24 months', 'Inverter and battery warranty'], ['Up to ₹78,000', 'Central subsidy on 3 kW+']];
  return (
    <section className="facts"><div className="wrap facts-grid">{facts.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div></section>
  );
}

const STEPS: [string, string, string][] = [
  ['phone', 'Tell us about your home', 'Fill the short form or call us. A solar advisor phones you to check your bill, roof area and grid connection.'],
  ['roof', 'Free roof survey', 'Our technician visits, measures direction, tilt and usable area, and checks the cable route. No quote is made before this.'],
  ['doc', 'Clear, itemised quote', 'You see every panel, inverter, cable and stand, with GST and any discount. Valid for 15 days.'],
  ['bank', 'Confirm with an advance', 'Pay 30% to confirm. Your order is packed and an installation crew is scheduled automatically.'],
  ['truck', 'Delivery and installation', 'Equipment is delivered with every serial number recorded. Our crew installs, tests and shares photos.'],
  ['shield', 'Sign-off and warranty', 'You sign on the crew\'s tablet. Your warranty clock starts and is tied to each serial number.'],
];
function How() {
  return (
    <section id="how" className="sec"><div className="wrap">
      <Head eyebrow="How it works" title="From first call to power on, in six clear steps" sub="You always know what happens next, and nothing is quoted or shipped without the previous step being done." />
      <ol className="steps-site">{STEPS.map(([i, t, d], n) => (
        <li key={t}><span className="num">{n + 1}</span><span className="ic"><Ico n={i} /></span><h3>{t}</h3><p>{d}</p></li>
      ))}</ol>
    </div></section>
  );
}

function Solutions({ onPick }: { onPick: (p: QuotePick) => void }) {
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [kind, setKind] = useState<'on_grid' | 'off_grid'>('on_grid');
  useEffect(() => { get<Pkg[]>('/public/packages').then(setPkgs).catch(() => setPkgs([])); }, []);
  const list = (pkgs || []).filter((p) => p.kind === kind);
  return (
    <section id="solutions" className="sec alt"><div className="wrap">
      <Head eyebrow="Solutions" title="Pick the system that fits your home" sub="Indicative prices from our current price list, before installation extras and discounts. Your exact quote follows the roof survey." />
      <div className="seg-site" role="tablist">
        <button className={kind === 'on_grid' ? 'on' : ''} onClick={() => setKind('on_grid')}>On-Grid <small>connected to the grid</small></button>
        <button className={kind === 'off_grid' ? 'on' : ''} onClick={() => setKind('off_grid')}>Off-Grid <small>with battery backup</small></button>
      </div>
      <p className="muted center" style={{ marginTop: 12 }}>{kind === 'on_grid' ? 'Best for homes with reliable grid power. Export extra units and qualify for the central subsidy.' : 'Best where power cuts are frequent or there is no grid. Includes a battery bank for night-time and backup use.'}</p>
      {pkgs === null ? <div className="spinner" /> : (
        <div className="pkg-grid">{list.map((p) => {
          const total = Math.round(p.list_price * (1 + GST));
          return (
            <article className="pkg" key={p.id}>
              <header><h3>{p.capacity_kw} kW</h3><span className="tag">{kind === 'on_grid' ? 'On-Grid' : 'Off-Grid'}</span></header>
              <div className="price">{money(total)}<small> incl. GST</small></div>
              <ul>
                <li><Ico n="check" /> {p.panels} × 540 W solar panels</li>
                <li><Ico n="check" /> {p.capacity_kw} kW inverter &amp; charge controller</li>
                <li><Ico n="check" /> Mounting stands, wiring &amp; earthing</li>
                {kind === 'off_grid' && <li><Ico n="check" /> Battery bank for backup</li>}
                <li><Ico n="check" /> Installation, testing &amp; sign-off</li>
              </ul>
              {kind === 'on_grid' && <div className="sub-note">Subsidy up to <b>{money(subsidyFor(p.capacity_kw))}</b></div>}
              <button className="s-btn primary block" onClick={() => { onPick({ kw: String(p.capacity_kw), type: p.kind }); scrollTo('quote'); }}>Get this quote</button>
            </article>
          );
        })}</div>
      )}
    </div></section>
  );
}

const MIN_BILL = 500;
const MAX_BILL = 30000;

function Savings({ onPick }: { onPick: (p: QuotePick) => void }) {
  const [bill, setBill] = useState(4000);
  const [text, setText] = useState('4000'); // what is typed in the box (may be mid-edit)
  const [chosenKw, setChosenKw] = useState<number | null>(null); // null = use our recommendation
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  useEffect(() => { get<Pkg[]>('/public/packages').then(setPkgs).catch(() => undefined); }, []);

  const setAmount = (n: number) => { const v = Math.min(MAX_BILL, Math.max(MIN_BILL, Math.round(n))); setBill(v); setText(String(v)); };

  const r = useMemo(() => {
    const units = bill / TARIFF; // units used each month
    const needKw = Math.max(1, Math.ceil(units / UNITS_PER_KW_MONTH)); // size that would cover the whole bill
    const recommended = Math.min(5, needKw);
    const kw = chosenKw ?? recommended;
    const generated = kw * UNITS_PER_KW_MONTH; // units the system makes each month
    const monthly = Math.min(bill, Math.round(generated * TARIFF));
    const after = bill - monthly;
    const covered = Math.min(100, Math.round((monthly / bill) * 100));
    const pkg = pkgs.find((p) => p.kind === 'on_grid' && p.capacity_kw === kw);
    const price = pkg ? Math.round(pkg.list_price * (1 + GST)) : null;
    const subsidy = subsidyFor(kw);
    const net = price ? Math.max(0, price - subsidy) : null;
    const payback = net && monthly ? net / (monthly * 12) : null;
    return { recommended, needKw, kw, generated, monthly, after, covered, yearly: monthly * 12, twentyFive: monthly * 12 * 25, price, subsidy, net, payback };
  }, [bill, chosenKw, pkgs]);

  return (
    <section id="savings" className="sec"><div className="wrap">
      <Head eyebrow="Savings calculator" title="See what solar could save you" sub={`Enter your monthly bill and pick a system size. It assumes about ₹${TARIFF} per unit and ${UNITS_PER_KW_MONTH} units a month from each kW. Your roof survey gives the exact figure.`} />
      <div className="calc">
        <div className="calc-in">
          <label htmlFor="bill-num">Your average monthly electricity bill</label>
          <div className="bill-box">
            <span>₹</span>
            <input
              id="bill-num" inputMode="numeric" value={text}
              onChange={(e) => { const t = e.target.value.replace(/[^\d]/g, '').slice(0, 5); setText(t); if (t) setBill(Math.min(MAX_BILL, Math.max(MIN_BILL, Number(t)))); }}
              onBlur={() => setAmount(Number(text) || MIN_BILL)}
              aria-label="Monthly bill in rupees"
            />
          </div>
          <input type="range" min={MIN_BILL} max={MAX_BILL} step={250} value={bill} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Monthly bill slider" />
          <div className="range-lab"><span>{money(MIN_BILL)}</span><span>{money(MAX_BILL)}</span></div>

          <div className="kw-pick">
            <span>System size</span>
            <div role="group" aria-label="System size">
              {[1, 2, 3, 4, 5].map((k) => (
                <button key={k} type="button" className={r.kw === k ? 'on' : ''} onClick={() => setChosenKw(k === r.recommended && chosenKw === null ? null : k)}>
                  {k} kW{k === r.recommended && <i>best fit</i>}
                </button>
              ))}
            </div>
          </div>
          {r.needKw > 5 && <p className="small calc-note">Your bill needs about {r.needKw} kW to cover fully. Our largest home system is 5 kW, so it covers {r.covered}% of this bill.</p>}
          {r.needKw <= 5 && r.kw < r.needKw && <p className="small calc-note">A {r.needKw} kW system would cover your whole bill. {r.kw} kW covers about {r.covered}%.</p>}
          <button className="s-btn primary" onClick={() => { onPick({ kw: String(r.kw), type: 'on_grid' }); scrollTo('quote'); }}>Get an exact quote for {r.kw} kW</button>
        </div>
        <div className="calc-out">
          <div className="kpi"><span>Your bill today</span><b>{money(bill)}<small className="inl"> /month</small></b></div>
          <div className="kpi"><span>Bill after solar</span><b>{money(r.after)}<small className="inl"> /month</small></b></div>
          <div className="kpi"><span>You save each month</span><b>{money(r.monthly)}</b><small>{r.covered}% of your bill covered</small></div>
          <div className="kpi"><span>You save each year</span><b>{money(r.yearly)}</b><small>about {money(r.twentyFive)} over 25 years</small></div>
          <div className="kpi"><span>Government subsidy</span><b>{money(r.subsidy)}</b><small>on a {r.kw} kW on-grid system</small></div>
          <div className="kpi"><span>System generates</span><b>{r.generated}<small className="inl"> units/month</small></b></div>
          <div className="kpi hi"><span>Estimated payback</span><b>{r.payback ? `${r.payback.toFixed(1)} years` : '-'}</b>{r.net != null && r.price != null && <small>{money(r.price)} system − {money(r.subsidy)} subsidy = {money(r.net)} net cost</small>}</div>
        </div>
      </div>
    </div></section>
  );
}

function Subsidy() {
  const rows: [string, string][] = [['1 kW', money(subsidyFor(1))], ['2 kW', money(subsidyFor(2))], ['3 kW and above', money(subsidyFor(3))]];
  return (
    <section id="subsidy" className="sec alt"><div className="wrap two">
      <div>
        <Head left eyebrow="Government subsidy" title="We handle the subsidy paperwork" sub="Rooftop solar under PM Surya Ghar: Muft Bijli Yojana gets central financial assistance. Tick the subsidy box on your enquiry and we prepare and track the application for you." />
        <ul className="ticks dark">
          <li><Ico n="check" /> Documents prepared with you</li>
          <li><Ico n="check" /> Application submitted on the portal and tracked end to end</li>
          <li><Ico n="check" /> You are told at every stage: documents, submitted, approved, paid</li>
        </ul>
        <p className="small muted">Subsidy is available on grid-connected (on-grid) systems and subject to scheme rules and approval.</p>
      </div>
      <div className="sub-card">
        <h3>Central assistance by system size</h3>
        {rows.map(([k, v]) => <div key={k} className="sub-row"><span>{k}</span><b>{v}</b></div>)}
      </div>
    </div></section>
  );
}

const WHY: [string, string, string][] = [
  ['tag', 'Honest, itemised quotes', 'Every panel, cable and stand listed with its price. No hidden extras.'],
  ['roof', 'Survey before quote', 'We measure your roof first, so the system is sized for your home, not guessed.'],
  ['search', 'Every part tracked', 'Each panel, inverter and battery has a serial number linked to you.'],
  ['camera', 'Proof of installation', 'Photos and a signed completion form are recorded when the crew finishes.'],
  ['shield', 'Warranty that is easy to use', 'Look up your warranty any time with a serial number.'],
  ['ticket', 'Real after-sales support', 'Raise a ticket and we resolve it. In-warranty repairs are free.'],
];
function Why() {
  return (
    <section id="why" className="sec"><div className="wrap">
      <Head eyebrow="Why SunPower" title="Built around trust, from quote to warranty" sub="Our whole process is designed so nothing falls through the cracks." />
      <div className="why-grid">{WHY.map(([i, t, d]) => <div className="why" key={t}><span className="ic"><Ico n={i} /></span><h3>{t}</h3><p>{d}</p></div>)}</div>
    </div></section>
  );
}

function Warranty() {
  const [serial, setSerial] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(''); setRes(null);
    try { setRes(await get(`/public/warranty/${encodeURIComponent(serial.trim())}`)); }
    catch (x) { setErr(x instanceof ApiError && x.status === 404 ? 'We could not find that serial number. Check the sticker on your inverter or battery.' : 'Could not check right now. Please try again.'); }
    finally { setBusy(false); }
  };
  const state = res?.warranty_state;
  return (
    <section className="sec alt"><div className="wrap two">
      <div>
        <Head left eyebrow="Already a customer?" title="Check your warranty in seconds" sub="Enter the serial number printed on your panel, inverter or battery to see your warranty status." />
      </div>
      <div className="card-site">
        <form onSubmit={check} className="lookup">
          <input placeholder="e.g. SP-INV3K-004093" value={serial} onChange={(e) => setSerial(e.target.value)} aria-label="Serial number" />
          <button className="s-btn primary" disabled={busy || serial.trim().length < 6}>{busy ? 'Checking…' : 'Check'}</button>
        </form>
        {err && <div className="alert bad" style={{ marginTop: 12 }}>{err}</div>}
        {res && (
          <div className={`result ${state}`}>
            <b>{res.product_name}</b>
            {state === 'in_warranty' && <p>In warranty until <b>{fmtDate(res.warranty_end)}</b> ({res.days_left} days left).</p>}
            {state === 'expired' && <p>Warranty ended on <b>{fmtDate(res.warranty_end)}</b>. Paid service is still available.</p>}
            {state === 'not_started' && <p>Warranty starts when the equipment is delivered to you.</p>}
          </div>
        )}
      </div>
    </div></section>
  );
}

const FAQ: [string, string][] = [
  ['What is the difference between on-grid and off-grid?', 'An on-grid system works with your electricity connection and can send extra power back to the grid; it qualifies for the central subsidy. An off-grid system includes batteries, so it works without the grid and gives backup during power cuts.'],
  ['How long does installation take?', 'After you pay the advance, our crew is scheduled automatically, usually within about three working days. The exact date is confirmed with you.'],
  ['How much do I pay upfront?', 'A 30% advance confirms your order. The balance is paid as agreed in your invoice. You can see every payment against your invoice.'],
  ['What warranty do I get?', 'Panels carry a 20-year warranty, and inverters and batteries carry 24 months. The warranty starts the day the equipment is delivered and is tied to each serial number.'],
  ['Can you help with the government subsidy?', 'Yes. Tick the subsidy option on your enquiry. We collect the documents, submit the application and track it until the subsidy is paid.'],
  ['What if something stops working?', 'Raise a service request with the serial number. We check your warranty automatically: repairs in warranty are free, and out-of-warranty work is billed with a clear invoice.'],
];
function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="sec"><div className="wrap narrow">
      <Head eyebrow="FAQ" title="Questions we hear often" />
      <div className="faq">{FAQ.map(([q, a], i) => (
        <div key={q} className={`faq-item ${open === i ? 'open' : ''}`}>
          <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>{q}<span>+</span></button>
          {open === i && <p>{a}</p>}
        </div>
      ))}</div>
    </div></section>
  );
}

function CtaBand() {
  return (
    <section className="cta-band"><div className="wrap cta-row">
      <div>
        <h2>Ready to switch to solar?</h2>
        <p>Get a free roof survey and an itemised quote from a real advisor. No cost, no obligation.</p>
      </div>
      <button className="s-btn primary" onClick={() => scrollTo('quote')}>Get my free quote</button>
    </div></section>
  );
}

function Footer() {
  const { user } = useAuth();
  return (
    <footer className="site-foot"><div className="wrap foot-grid">
      <div>
        <div className="site-logo light"><span><Ico n="sun" /></span>SunPower<b>Solutions</b></div>
        <p>Rooftop solar for homes: survey, quote, installation, subsidy and after-sales support in one place.</p>
      </div>
      <div><h4>Explore</h4><button onClick={() => scrollTo('how')}>How it works</button><button onClick={() => scrollTo('solutions')}>Solutions</button><button onClick={() => scrollTo('savings')}>Savings calculator</button><button onClick={() => scrollTo('faq')}>FAQ</button></div>
      <div><h4>Customers</h4><button onClick={() => scrollTo('quote')}>Get a free quote</button><Link to="/enquire">Enquiry page</Link></div>
      <div><h4>Team</h4><Link to={user ? '/' : '/login'}>{user ? 'Open dashboard' : 'Staff login'}</Link></div>
    </div><div className="wrap copy">© {new Date().getFullYear()} SunPower Solutions. All rights reserved.</div></footer>
  );
}

function Head({ eyebrow, title, sub, left, light }: { eyebrow: string; title: ReactNode; sub?: ReactNode; left?: boolean; light?: boolean }) {
  return (
    <div className={`sec-head ${left ? 'left' : ''} ${light ? 'light' : ''}`}>
      <span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{sub && <p>{sub}</p>}
    </div>
  );
}

export default function Home() {
  const [sel, setSel] = useState<QuotePick>({ kw: '3', type: 'on_grid' });
  useEffect(() => { document.title = 'SunPower Solutions | Rooftop solar for your home'; return () => { document.title = 'SunPower Solar ERP'; }; }, []);
  return (
    <div className="site">
      <Nav />
      <Hero sel={sel} />
      <Facts />
      <How />
      <Solutions onPick={setSel} />
      <Savings onPick={setSel} />
      <Subsidy />
      <Why />
      <Warranty />
      <Faq />
      <CtaBand />
      <Footer />
    </div>
  );
}
