import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { get } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, PageHead, Seg, fmtDate, label, useAsync } from '../components/ui';
import { Kpi, KpiRow } from '../components/kit';
import { Icon } from '../components/icons';
import ScheduleTech from '../components/ScheduleTech';
import { locate, routeKm, shortestOrder } from '../lib/geo';

// ---------- dates (plain YYYY-MM-DD strings, no time zones to trip over) ----------
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * 864e5));
const mondayOf = (s: string) => addDays(s, -((parse(s).getUTCDay() + 6) % 7));
const todayIso = () => new Date().toLocaleDateString('en-CA');
const heading = (s: string, o: Intl.DateTimeFormatOptions) => parse(s).toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' });

const TYPES: Record<string, { name: string; color: string }> = {
  survey: { name: 'Site survey', color: '#f59e0b' },
  install: { name: 'Installation', color: '#3b82f6' },
  inspection: { name: 'Warranty inspection', color: '#8b5cf6' },
};
const DONE = ['completed', 'approved', 'closed', 'rejected', 'fulfilled'];

interface Ev {
  type: 'survey' | 'install' | 'inspection'; id: number; date: string; status: string; technician_id: number; technician_name: string;
  customer_name: string; phone: string; address: string; city: string; kw: number | null; link: string; title: string;
}
const keyOf = (e: Ev) => `${e.type}-${e.id}`;
const firstName = (n: string) => n.split(' ')[0];

/** The day's visits on a map: numbered pins in visiting order, joined by a line. */
function RouteMap({ stops }: { stops: { n: number; lat: number; lng: number; title: string; sub: string; color: string }[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, zoomControl: true }).setView([22.6, 72.4], 7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    if (!stops.length) return;
    const pts = stops.map((s) => [s.lat, s.lng] as [number, number]);
    if (stops.length > 1) L.polyline(pts, { color: '#6366f1', weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(g);
    stops.forEach((s) => {
      const icon = L.divIcon({ className: 'pin-wrap', html: `<span class="pin" style="background:${s.color}">${s.n}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const mk = L.marker([s.lat, s.lng], { icon }).addTo(g);
      const pop = document.createElement('div');
      const b = document.createElement('b'); b.textContent = `${s.n}. ${s.title}`;
      const p = document.createElement('div'); p.textContent = s.sub;
      pop.append(b, p);
      mk.bindPopup(pop);
    });
    if (pts.length === 1) m.setView(pts[0], 12); else m.fitBounds(L.latLngBounds(pts), { padding: [34, 34], maxZoom: 13 });
    setTimeout(() => m.invalidateSize(), 50);
  }, [stops]);

  return <div ref={el} className="route-map" role="img" aria-label="Map of the day's visits" />;
}

function DayPanel({ day, events, canAssign }: { day: string; events: Ev[]; canAssign: boolean }) {
  const [shortest, setShortest] = useState(false);
  useEffect(() => setShortest(false), [day]);

  const placed = useMemo(() => events.map((e) => ({ e, p: locate(e.address, e.city) })), [events]);
  const mappable = placed.filter((x) => x.p) as { e: Ev; p: NonNullable<ReturnType<typeof locate>> }[];
  const listed = mappable.map((x) => ({ ...x, lat: x.p.lat, lng: x.p.lng }));
  const best = useMemo(() => shortestOrder(listed), [listed]);
  const ordered = shortest ? best : listed;
  const kmListed = routeKm(listed), kmBest = routeKm(best);
  const number = new Map(ordered.map((x, i) => [keyOf(x.e), i + 1]));
  const rows = shortest ? [...events].sort((a, b) => (number.get(keyOf(a)) || 99) - (number.get(keyOf(b)) || 99)) : events;

  return (
    <div className="stack">
      <div className="day-head">
        <div><b>{heading(day, { weekday: 'long', day: 'numeric', month: 'long' })}</b><span>{events.length === 0 ? 'No visits' : `${events.length} visit${events.length === 1 ? '' : 's'}`}</span></div>
        {day === todayIso() && <span className="tag-today">Today</span>}
      </div>
      {events.length === 0 ? <Empty>Nothing is booked for this day.</Empty> : (
        <ol className="visits">{rows.map((e) => {
          const t = TYPES[e.type];
          const n = number.get(keyOf(e));
          const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.address}, ${e.city || ''}`)}`;
          return (
            <li key={keyOf(e)} style={{ '--c': t.color } as any} className={DONE.includes(e.status) ? 'done' : ''}>
              <span className="v-n">{n ?? '·'}</span>
              <div className="v-body">
                <div className="v-top"><b>{t.name}</b><Badge status={e.status}>{label(e.status)}</Badge></div>
                <div className="v-who"><Link to={e.link}>{e.customer_name}</Link>{e.kw ? <small> · {e.kw} kW</small> : null}</div>
                <div className="v-addr"><Icon n="pin" /><span>{e.address}{e.city ? `, ${e.city}` : ''}</span></div>
                <div className="v-meta">
                  <a href={`tel:${e.phone}`}><Icon n="phone" />{e.phone}</a>
                  <span><Icon n="user" />{e.technician_name}</span>
                  <a href={maps} target="_blank" rel="noreferrer">Open in Maps</a>
                </div>
              </div>
            </li>
          );
        })}</ol>
      )}

      {mappable.length > 0 && (
        <div className="stack">
          <div className="map-bar">
            <b><Icon n="map" />Map</b>
            {mappable.length > 1 && (
              <span className="map-km">
                {kmListed.toFixed(0)} km in this order
                {kmBest + 1 < kmListed && !shortest && <button className="ta-link" onClick={() => setShortest(true)}>Shortest route: {kmBest.toFixed(0)} km (saves {(kmListed - kmBest).toFixed(0)})</button>}
                {shortest && <button className="ta-link" onClick={() => setShortest(false)}>Back to the original order</button>}
              </span>
            )}
          </div>
          <RouteMap stops={ordered.map((x, i) => ({ n: i + 1, lat: x.lat, lng: x.lng, title: `${TYPES[x.e.type].name}: ${x.e.customer_name}`, sub: `${x.e.address}, ${x.e.city || ''}`, color: TYPES[x.e.type].color }))} />
          <p className="map-note">Pins mark the area, not the exact house. Use <b>Open in Maps</b> on a visit for exact directions.{placed.length > mappable.length && ` ${placed.length - mappable.length} visit(s) could not be placed on the map.`}</p>
        </div>
      )}
      {canAssign && false}
    </div>
  );
}

export default function Schedule() {
  const user = useCurrentUser();
  const isTech = user.role === 'technician';
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(todayIso());
  const [day, setDay] = useState(todayIso());
  const [tech, setTech] = useState('');
  const [show, setShow] = useState<Record<string, boolean>>({ survey: true, install: true, inspection: true });
  const [assign, setAssign] = useState<any>(null);
  const techs = useAsync(() => (isTech ? Promise.resolve([]) : get('/users?role=technician')), []);

  const first = view === 'month' ? mondayOf(cursor.slice(0, 8) + '01') : mondayOf(cursor);
  const last = addDays(first, view === 'month' ? 41 : 6);
  const state = useAsync(() => get(`/schedule?from=${first}&to=${last}${tech ? `&technicianId=${tech}` : ''}`), [first, last, tech]);

  const move = (dir: number) => {
    if (view === 'week') setCursor(addDays(cursor, dir * 7));
    else { const d = parse(cursor); d.setUTCMonth(d.getUTCMonth() + dir, 1); setCursor(iso(d)); }
  };
  const goToday = () => { setCursor(todayIso()); setDay(todayIso()); };
  const days = Array.from({ length: view === 'month' ? 42 : 7 }, (_, i) => addDays(first, i));
  const thisMonth = cursor.slice(0, 7);

  return (
    <>
      <PageHead title="Schedule" sub={isTech ? 'Your visits: surveys, installations and warranty inspections' : 'Surveys, installations and warranty inspections for every technician'} />
      <Async state={state}>{(d: { events: Ev[]; toAssign: any[] }) => {
        const all = d.events.filter((e) => show[e.type]);
        const byDay = new Map<string, Ev[]>();
        for (const e of all) byDay.set(e.date, [...(byDay.get(e.date) || []), e]);
        const count = (t: string) => d.events.filter((e) => e.type === t).length;
        const todays = byDay.get(todayIso()) || [];
        return (
          <div className="page-stack">
            <KpiRow>
              <Kpi icon="calendar" tone="indigo" label="Today" value={todays.length} sub={todays.length ? 'visits booked today' : 'nothing booked today'} />
              <Kpi icon="search" tone="amber" label="Site surveys" value={count('survey')} sub="in this view" />
              <Kpi icon="wrench" tone="blue" label="Installations" value={count('install')} sub="in this view" />
              <Kpi icon="shield" tone={d.toAssign.length ? 'rose' : 'violet'} label={isTech ? 'Warranty inspections' : 'Need a technician'} value={isTech ? count('inspection') : d.toAssign.length} sub={isTech ? 'in this view' : 'delivered, not yet assigned'} />
            </KpiRow>

            <div className="cal-bar">
              <div className="cal-nav">
                <button className="btn secondary sm" onClick={() => move(-1)} aria-label="Previous">‹</button>
                <button className="btn secondary sm" onClick={goToday}>Today</button>
                <button className="btn secondary sm" onClick={() => move(1)} aria-label="Next">›</button>
                <h2>{view === 'month' ? heading(cursor, { month: 'long', year: 'numeric' }) : `${heading(first, { day: 'numeric', month: 'short' })} to ${heading(addDays(first, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`}</h2>
              </div>
              <div className="cal-tools">
                {!isTech && <select value={tech} onChange={(e) => setTech(e.target.value)} aria-label="Technician"><option value="">All technicians</option>{(techs.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
                <Seg value={view} onChange={(v) => setView(v as any)} options={[['month', 'Month'], ['week', 'Week']]} />
              </div>
            </div>
            <div className="cal-legend">
              {Object.entries(TYPES).map(([k, t]) => (
                <button key={k} className={show[k] ? 'on' : ''} style={{ '--c': t.color } as any} onClick={() => setShow({ ...show, [k]: !show[k] })} aria-pressed={show[k]}><i />{t.name}</button>
              ))}
            </div>

            <div className="cal-layout">
              <Card pad={false}>
                <div className={`cal ${view}`}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <div key={w} className="cal-wd">{w}</div>)}
                  {days.map((dd) => {
                    const evs = byDay.get(dd) || [];
                    const out = view === 'month' && dd.slice(0, 7) !== thisMonth;
                    return (
                      <button key={dd} className={`cal-day ${dd === day ? 'sel' : ''} ${dd === todayIso() ? 'today' : ''} ${out ? 'out' : ''}`} onClick={() => setDay(dd)} aria-label={`${heading(dd, { weekday: 'long', day: 'numeric', month: 'long' })}, ${evs.length} visits`}>
                        <span className="cal-num">{parse(dd).getUTCDate()}</span>
                        <span className="cal-evs">
                          {evs.slice(0, view === 'week' ? 12 : 3).map((e) => (
                            <span key={keyOf(e)} className={`chip-ev ${DONE.includes(e.status) ? 'done' : ''}`} style={{ '--c': TYPES[e.type].color } as any} title={`${TYPES[e.type].name}: ${e.customer_name} (${e.technician_name})`}>
                              <i />{view === 'week' ? `${e.customer_name} · ${firstName(e.technician_name)}` : e.customer_name}
                            </span>
                          ))}
                          {view === 'month' && evs.length > 3 && <span className="cal-more">+{evs.length - 3} more</span>}
                        </span>
                        {evs.length > 0 && <span className="cal-dots">{evs.slice(0, 6).map((e) => <i key={keyOf(e)} style={{ background: TYPES[e.type].color }} />)}</span>}
                      </button>
                    );
                  })}
                </div>
              </Card>

              <div className="stack">
                <Card><DayPanel day={day} events={byDay.get(day) || []} canAssign={false} /></Card>
                {!isTech && d.toAssign.length > 0 && (
                  <Card title="Waiting for a technician">
                    <ul className="to-assign">{d.toAssign.map((j) => (
                      <li key={j.id}>
                        <div><Link to={`/orders/${j.order_id}`}><b>{j.customer_name}</b></Link><small>{j.order_no} · {j.kw} kW · {j.city || j.address} · delivered {fmtDate(j.delivered_on)}</small></div>
                        {can(user, 'sales') && <button className="btn sm" onClick={() => setAssign(j)}>Assign</button>}
                      </li>
                    ))}</ul>
                  </Card>
                )}
              </div>
            </div>
            {assign && <ScheduleTech orderId={assign.order_id} job={{ id: assign.id, crew: [], scheduled_date: null }} onClose={() => setAssign(null)} onDone={() => { setAssign(null); state.reload(); }} />}
          </div>
        );
      }}</Async>
    </>
  );
}
