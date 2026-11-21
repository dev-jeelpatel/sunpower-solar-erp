// Shared building blocks for the list pages: KPI cards, people cells, filter chips, tags, meters, steppers.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './icons';
import { fmtDate } from './ui';

export type KitTone = 'indigo' | 'blue' | 'green' | 'amber' | 'rose' | 'violet';

// ---------- people ----------
const PALETTE: [string, string][] = [
  ['#eef2ff', '#4338ca'], ['#dbeafe', '#1d4ed8'], ['#d1fae5', '#047857'],
  ['#fef3c7', '#b45309'], ['#ffe4e6', '#be123c'], ['#ede9fe', '#6d28d9'],
];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
export const initials = (name = '') => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export function Avatar({ name = '', size = 38, mini = false }: { name?: string; size?: number; mini?: boolean }) {
  const [bg, ink] = PALETTE[hash(name) % PALETTE.length];
  return (
    <span className={mini ? 'mini-av' : 'cust-av'} style={{ background: bg, color: ink, ...(mini ? {} : { width: size, height: size }) }}>
      {initials(name)}
    </span>
  );
}

/** Avatar + name + a muted second line. */
export function Person({ name, sub, to }: { name?: string | null; sub?: ReactNode; to?: string }) {
  const n = name || 'Unknown';
  return (
    <div className="cust">
      <Avatar name={n} />
      <div>{to ? <Link to={to} onClick={(e) => e.stopPropagation()}><b>{n}</b></Link> : <b>{n}</b>}{sub != null && sub !== '' && <small>{sub}</small>}</div>
    </div>
  );
}

// ---------- KPI cards ----------
export function Kpi({ icon, tone, label, value, sub }: { icon: IconName; tone: KitTone; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`kpi-card t-${tone}`}>
      <span className="kpi-ic"><Icon n={icon} /></span>
      <div className="kpi-body"><span className="kpi-label">{label}</span><b className="kpi-value">{value}</b>{sub && <span className="kpi-sub">{sub}</span>}</div>
    </div>
  );
}
export const KpiRow = ({ children }: { children: ReactNode }) => <div className="kpi-grid">{children}</div>;

// ---------- filter chips ----------
export interface ChipOption { value: string; label: string; count?: number; color?: string }
export function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: ChipOption[] }) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.color && <i style={{ background: o.color }} />}{o.label}{o.count != null && <span>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- small things ----------
export const Tag = ({ tone = 'slate', children }: { tone?: 'blue' | 'amber' | 'green' | 'rose' | 'violet' | 'slate'; children: ReactNode }) => (
  <span className={`tagx ${tone}`}>{children}</span>
);

/** Progress meter with a % label (e.g. paid vs total). */
export function Meter({ value, max, tone = 'indigo', caption }: { value: number; max: number; tone?: 'indigo' | 'green' | 'amber' | 'rose'; caption?: ReactNode }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="meter">
      <div className={`meter-track m-${tone}`}><i style={{ width: `${pct}%` }} /></div>
      <span>{caption ?? `${Math.round(pct)}%`}</span>
    </div>
  );
}

/** Horizontal step dots: done / current / upcoming. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="stepper" aria-label={`Step ${current + 1} of ${steps.length}`}>
      {steps.map((s, i) => (
        <span key={s} className={i < current ? 'done' : i === current ? 'now' : ''} title={s}><i />{i < steps.length - 1 && <b />}</span>
      ))}
    </div>
  );
}

// ---------- time helpers ----------
export function ago(d?: string | null) {
  if (!d) return '-';
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  return days < 31 ? `${days} day${days === 1 ? '' : 's'} ago` : fmtDate(d);
}

/** Days until/since a date (YYYY-MM-DD): { text, tone } for badges like "In 3 days" / "2 days overdue". */
export function dueIn(d?: string | null): { text: string; tone: 'rose' | 'amber' | 'green' | 'slate'; days: number } {
  if (!d) return { text: '', tone: 'slate', days: 0 };
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const days = Math.round((new Date(d.slice(0, 10)).getTime() - today) / 864e5);
  if (days === 0) return { text: 'Today', tone: 'amber', days };
  if (days > 0) return { text: `In ${days} day${days === 1 ? '' : 's'}`, tone: days <= 3 ? 'amber' : 'slate', days };
  return { text: `${-days} day${days === -1 ? '' : 's'} ago`, tone: 'rose', days };
}
