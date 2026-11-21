import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ChangeEvent, type FocusEvent as ReactFocusEvent, type ReactNode,
} from 'react';
import { ApiError } from '../api';
import type { FieldErrors, Tone } from '../types';
import { Icon } from './icons';

// ---------- formatting ----------
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number | null | undefined, decimals = false) => (n == null ? '-' : `₹${(decimals ? inr2 : inr).format(n)}`);
export const fmtDate = (d?: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
export const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
export const label = (s: unknown) => String(s ?? '').replace(/_/g, ' ');
export const toLocalInput = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// ---------- toasts ----------
type ToastKind = 'ok' | 'bad';
type Push = (message: string, kind?: ToastKind) => void;
const ToastCtx = createContext<Push>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const push = useCallback<Push>((message, kind = 'ok') => {
    const id = Math.random();
    setItems((l) => [...l, { id, message, kind }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}</div>
    </ToastCtx.Provider>
  );
}

// ---------- data loading ----------
export interface AsyncState<T = any> { data: T | null; loading: boolean; error: Error | null; reload: () => void }

export function useAsync<T = any>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: Error | null }>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((error) => !cancelled && setState({ data: null, loading: false, error }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

/** Runs an async action with a busy flag; maps server field errors onto the form. */
export function useAction(setErrors?: (e: FieldErrors) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const run = useCallback(async <R,>(fn: () => Promise<R>, okMessage?: string): Promise<R | true | false> => {
    setBusy(true); setError(''); setErrors?.({});
    try {
      const r = await fn();
      if (okMessage) toast(okMessage, 'ok');
      return r ?? true;
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (e.fields && Object.keys(e.fields).length) setErrors?.(e.fields);
        if (!setErrors) toast(e.message, 'bad');
      } else { setError('Unexpected error'); console.error(e); }
      return false;
    } finally { setBusy(false); }
  }, [setErrors, toast]);
  return { run, busy, error, setError };
}

// ---------- building blocks ----------
/** Shimmering placeholder rows instead of a lone spinner. */
export const Loading = () => (
  <div className="skel" role="status" aria-label="Loading">
    <div className="skel-row w40" /><div className="skel-row" /><div className="skel-row" /><div className="skel-row w70" /><div className="skel-row" />
  </div>
);
export const Empty = ({ children = 'Nothing here yet.' }: { children?: ReactNode }) => (
  <div className="empty"><span className="empty-ic"><Icon n="inbox" /></span><p>{children}</p></div>
);
export const ErrorBox = ({ error }: { error?: Error | string | null }) =>
  (error ? <div className="alert bad">{typeof error === 'string' ? error : error.message || String(error)}</div> : null);

export function Async<T = any>({ state, children }: { state: AsyncState<T>; children: (data: T) => ReactNode }) {
  if (state.loading && !state.data) return <Loading />;
  if (state.error) return <ErrorBox error={state.error} />;
  return <>{children(state.data as T)}</>;
}

export const Card = ({ title, actions, children, pad = true, className = '' }: {
  title?: ReactNode; actions?: ReactNode; children?: ReactNode; pad?: boolean; className?: string;
}) => (
  <section className={`card ${className}`}>
    {(title || actions) && <div className="card-head"><h2>{title}</h2><div className="row">{actions}</div></div>}
    <div className={pad ? 'card-pad' : ''}>{children}</div>
  </section>
);

export const PageHead = ({ title, sub, actions, crumb }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) => (
  <div className="page-head">
    <div>{crumb}<h1>{title}</h1>{sub && <p>{sub}</p>}</div>
    <div className="row">{actions}</div>
  </div>
);

export const Stat = ({ label: l, value, sub, tone = 'accent' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone }) => (
  <div className={`card stat ${tone}`}><div className="label">{l}</div><div className="value">{value}</div>{sub && <div className="sub">{sub}</div>}</div>
);

const TONE: Record<string, string[]> = {
  ok: ['paid', 'approved', 'completed', 'delivered', 'in_warranty', 'won', 'received', 'confirmed', 'closed', 'disbursed', 'resolved', 'in_stock', 'qualified'],
  warn: ['pending_payment', 'sent', 'partially_paid', 'packing', 'scheduled', 'survey_scheduled', 'documents_pending', 'open', 'draft', 'ordered', 'contacted', 'dispatched', 'submitted', 'assigned', 'pending', 'not_started', 'high'],
  bad: ['lost', 'rejected', 'expired', 'out_of_warranty', 'faulty', 'cancelled', 'void', 'urgent', 'low_stock'],
  info: ['new', 'quoted', 'survey_approved', 'unscheduled'],
};
export function Badge({ status, children }: { status?: string | null; children?: ReactNode }) {
  const tone = Object.keys(TONE).find((k) => TONE[k].includes(status ?? '')) || '';
  return <span className={`badge ${tone}`}>{children || label(status)}</span>;
}

export function Field({ label: l, error, hint, children, className = '', required, rules }: {
  label?: ReactNode; error?: string; hint?: ReactNode; children?: ReactNode; className?: string; required?: boolean;
  /** Checked when the person leaves the box, so a mistake is flagged straight away, not only on submit. */
  rules?: Array<(v: any) => string | null | undefined>;
}) {
  const [local, setLocal] = useState('');
  const check = (e: ReactFocusEvent<HTMLElement>) => {
    if (!rules) return;
    const t = e.target as HTMLInputElement;
    if (t.type === 'checkbox' || t.type === 'radio' || typeof t.value !== 'string') return;
    for (const r of rules) {
      const m = r(t.value);
      if (m) { setLocal(m); return; }
    }
    setLocal('');
  };
  const shown = error || local;
  return (
    <div className={`field ${shown ? 'invalid' : ''} ${className}`} onBlurCapture={check} onInputCapture={() => local && setLocal('')}>
      {l && <label>{l}{required && <span style={{ color: 'var(--bad)' }}> *</span>}</label>}
      {children}
      {shown ? <span className="err" role="alert">{shown}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/** Form state helper: values + errors + onChange binder. */
export function useForm<V extends Record<string, any>>(initial: V) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (k: keyof V & string, v: unknown) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const bind = (k: keyof V & string): { value: any; onChange: (e: ChangeEvent<any>) => void } => ({
    value: values[k] ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      set(k, (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value),
  });
  return { values, setValues, errors, setErrors, set, bind, reset: () => { setValues(initial); setErrors({}); } };
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children?: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

type Option = [string, string];

export const Tabs = ({ tabs, value, onChange }: { tabs: Option[]; value: string; onChange: (k: string) => void }) => (
  <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>
);

export const Seg = ({ options, value, onChange }: { options: Option[]; value: string; onChange: (k: string) => void }) => (
  <div className="seg">{options.map(([k, l]) => <button key={k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>
);

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="row between" style={{ padding: '12px 16px' }}>
      <span className="muted small">Page {page} of {pages} · {total} records</span>
      <div className="row"><button className="btn secondary sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn secondary sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div>
    </div>
  );
}

/** Debounce a value (search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const Confirm = ({ title, message, onYes, onNo, yesLabel = 'Confirm', danger }: {
  title: string; message: ReactNode; onYes: () => void; onNo: () => void; yesLabel?: string; danger?: boolean;
}) => (
  <Modal title={title} onClose={onNo} footer={<><button className="btn secondary" onClick={onNo}>Cancel</button><button className={`btn ${danger ? 'danger' : ''}`} onClick={onYes}>{yesLabel}</button></>}>
    <p style={{ margin: 0 }}>{message}</p>
  </Modal>
);
