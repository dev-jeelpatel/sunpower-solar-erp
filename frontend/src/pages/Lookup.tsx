import { FileClaim } from './Claims';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../api';
import { useCurrentUser, can } from '../auth';
import { Badge, Card, PageHead, fmtDate, label, useAsync, useDebounced } from '../components/ui';
import { Person, Tag } from '../components/kit';
import { Icon, type IconName } from '../components/icons';
import { NewTicket } from './Tickets';

export default function Lookup() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('serial') || '');
  const dq = useDebounced(q, 250);
  const [unit, setUnit] = useState<any>(null);
  const [err, setErr] = useState('');
  const [raising, setRaising] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const results = useAsync(() => (dq.trim().length >= 3 ? get(`/search?q=${encodeURIComponent(dq.trim())}`) : Promise.resolve({ units: [], customers: [] })), [dq]);

  const open = async (serial: string) => {
    setErr(''); setUnit(null);
    try { setUnit(await get(`/inventory/units/lookup/${encodeURIComponent(serial)}`)); setParams({ serial }); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { if (params.get('serial')) open(params.get('serial') as string); }, []); // eslint-disable-line

  const r = results.data;
  const state: string = unit?.warranty_state || '';
  const termDays = Math.max(1, Number(unit?.warranty_months || 0) * 30.4);
  const pct = state === 'in_warranty' ? Math.min(100, Math.round((Number(unit.days_left) / termDays) * 100)) : 0;
  return (
    <>
      <PageHead title="Warranty lookup" sub="Search by serial number, customer name or phone" />
      <div className="page-stack">
        <div className="lk-hero">
          <h2>Find any unit in seconds</h2>
          <p>Type a serial number, a customer name or a phone number. We show who owns it and whether it is still under warranty.</p>
          <div className="lk-search">
            <Icon n="search" />
            <input className="mono" autoFocus placeholder="e.g. INV3-001 or 9825010001" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {err && <div className="alert bad">{err}</div>}

        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="stack">
            {r && (r.units.length > 0 || r.customers.length > 0) && (
              <Card title="Matches" pad={false}><div className="table-wrap"><table><tbody>
                {r.units.map((u) => (
                  <tr key={u.serial_no} className="clickable" onClick={() => open(u.serial_no)}>
                    <td><b>{u.product_name}</b><span className="sub-line"><span className="mono">{u.serial_no}</span></span></td>
                    <td>{u.customer_name ? <Person name={u.customer_name} /> : <span className="muted">In stock</span>}</td>
                    <td><Badge status={u.warranty_state} /></td>
                  </tr>))}
                {r.customers.map((c) => (
                  <tr key={`c${c.id}`}><td colSpan={3}><Person name={c.name} sub={`${c.phone}${c.city ? ` · ${c.city}` : ''}`} /></td></tr>))}
              </tbody></table></div></Card>)}
            {r && dq.length >= 3 && r.units.length === 0 && r.customers.length === 0 && <div className="alert info">No matches for “{dq}”.</div>}
            {!r?.units?.length && !r?.customers?.length && dq.length < 3 && !unit && (
              <Card><div className="empty"><span className="empty-ic"><Icon n="search" /></span><p>Start typing to search units and customers.</p></div></Card>)}
          </div>

          {unit && (
            <div>
              <div className={`lk-status ${state}`}>
                <div className="lk-ring" style={{ '--p': pct } as any}>
                  <b>{state === 'in_warranty' ? <>{unit.days_left}<small>days left</small></> : state === 'expired' ? <>Ended</> : <>Not<small>started</small></>}</b>
                </div>
                <div>
                  <h3>{state === 'in_warranty' ? 'Under warranty' : state === 'expired' ? 'Warranty expired' : 'Warranty not started'}</h3>
                  <p>{state === 'in_warranty' ? `Valid until ${fmtDate(unit.warranty_end)}. Repair or replacement is free.`
                    : state === 'expired' ? `Ended on ${fmtDate(unit.warranty_end)}. Parts and labour will be billed.` : 'It starts when the unit is delivered to the customer.'}</p>
                </div>
              </div>
              <Card title="Unit details" actions={<Badge status={unit.status} />}>
                <dl className="kv">
                  <dt>Product</dt><dd><b>{unit.product_name}</b> <span className="muted mono small">({unit.sku})</span></dd>
                  <dt>Serial</dt><dd><Tag tone="slate"><span className="mono">{unit.serial_no}</span></Tag></dd>
                  <dt>Customer</dt><dd>{unit.customer_name ? <Person name={unit.customer_name} sub={<>{unit.customer_phone && <a href={`tel:${unit.customer_phone}`}>{unit.customer_phone}</a>}{unit.customer_address ? ` · ${unit.customer_address}` : ''}</>} /> : '-'}</dd>
                  <dt>Order</dt><dd>{unit.order_no || '-'}</dd>
                  <dt>Delivered</dt><dd>{fmtDate(unit.delivered_at)}</dd>
                  <dt>Warranty term</dt><dd>{unit.warranty_months} months{unit.warranty_start ? ` · started ${fmtDate(unit.warranty_start)}` : ''}</dd>
                  <dt>Past tickets</dt><dd>{(unit.tickets || []).length === 0 ? 'None' : unit.tickets.map((t) => <div key={t.id}><Link to={`/tickets/${t.id}`}>{t.ticketNo}</Link> · {t.subject} <Badge status={t.status} /></div>)}</dd>
                </dl>
                {unit.customer_id && can(user, 'support', 'sales') && <div className="row" style={{ marginTop: 16 }}><button className="btn" onClick={() => setRaising(true)}><Icon n="ticket" />Raise service ticket</button>{can(user, 'support') && unit.status === 'delivered' && <button className="btn secondary" onClick={() => setClaiming(true)}><Icon n="shield" />File warranty claim</button>}</div>}
              </Card>
            </div>
          )}
        </div>
      </div>
      {raising && <NewTicket initialSerial={unit.serial_no} onClose={() => setRaising(false)} />}
      {claiming && <FileClaim initialSerial={unit.serial_no} onClose={() => setClaiming(false)} />}
    </>
  );
}
