import { useEffect } from 'react';
import { get } from '../api';
import { fmtDate, useAsync } from './ui';

/**
 * Pick one technician for a date. The list is checked against their schedule first:
 * a busy technician cannot be chosen, and the reason and next free day are shown.
 */
export default function TechPicker({ date, value, onChange, onPickDate, excludeJobId, current }: {
  date: string; value: string; onChange: (id: string) => void; onPickDate?: (d: string) => void;
  excludeJobId?: number; current?: string[];
}) {
  const state = useAsync(
    () => (date ? get(`/availability?date=${date}${excludeJobId ? `&excludeJobId=${excludeJobId}` : ''}`) : Promise.resolve([])),
    [date, excludeJobId],
  );
  const list: any[] = state.data || [];

  // a technician who turns out to be busy on the newly chosen date can no longer stay selected
  useEffect(() => {
    if (value && list.length && list.find((t) => String(t.id) === value && !t.available)) onChange('');
  }, [state.data]); // eslint-disable-line

  if (!date) return <div className="muted">Choose a date first to see who is free.</div>;
  if (state.loading && !state.data) return <div className="muted">Checking schedules…</div>;
  if (state.error) return <div className="alert bad">Could not check availability. {state.error.message}</div>;
  if (list.length === 0) return <div className="alert bad">There are no active technicians. Add one in Staff first.</div>;

  const free = list.filter((t) => t.available);
  const soonest = list.map((t) => t.nextFree).filter(Boolean).sort()[0];
  return (
    <div className="tech-avail">
      <div className={`ta-sum ${free.length ? 'ok' : 'bad'}`}>
        {free.length
          ? `${free.length} of ${list.length} technician${list.length === 1 ? '' : 's'} free on ${fmtDate(date)}`
          : `No technician is free on ${fmtDate(date)}.`}
        {!free.length && soonest && onPickDate && <> <button type="button" className="ta-link" onClick={() => onPickDate(soonest)}>Use {fmtDate(soonest)} instead</button></>}
      </div>
      <div className="tech-pick" role="radiogroup" aria-label="Technician">
        {list.map((t) => {
          const mine = (current || []).includes(t.name);
          return (
            <label key={t.id} className={`tech-opt ${value === String(t.id) ? 'on' : ''} ${t.available ? '' : 'off'}`}>
              <input type="radio" name="tech" disabled={!t.available} checked={value === String(t.id)} onChange={() => onChange(String(t.id))} />
              <span className="ta-name"><b>{t.name}</b>{mine && <em>currently assigned</em>}
                {!t.available && <small>{t.reason}</small>}
                {t.available && t.note && <small>{t.note}</small>}
              </span>
              {t.available
                ? <span className="ta-badge ok">Available</span>
                : <span className="ta-badge bad">Busy{t.nextFree && onPickDate ? <button type="button" className="ta-link" onClick={(e) => { e.preventDefault(); onPickDate(t.nextFree); }}>Free {fmtDate(t.nextFree)}</button> : null}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
