import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../api';
import { useCurrentUser, can } from '../auth';
import { Badge, Card, PageHead, fmtDate, label, useAsync, useDebounced } from '../components/ui';
import { NewTicket } from './Tickets';

/** Find the customer and exact serial number within seconds, and see warranty status. */
export default function Lookup() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('serial') || '');
  const dq = useDebounced(q, 250);
  const [unit, setUnit] = useState<any>(null);
  const [err, setErr] = useState('');
  const [raising, setRaising] = useState(false);
  const results = useAsync(() => (dq.trim().length >= 3 ? get(`/search?q=${encodeURIComponent(dq.trim())}`) : Promise.resolve({ units: [], customers: [] })), [dq]);

  const open = async (serial) => {
    setErr(''); setUnit(null);
    try { setUnit(await get(`/inventory/units/lookup/${encodeURIComponent(serial)}`)); setParams({ serial }); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { if (params.get('serial')) open(params.get('serial')); }, []); // eslint-disable-line

  const r = results.data;
  const ok = unit?.warranty_state === 'in_warranty';
  return (
    <>
      <PageHead title="Warranty lookup" sub="Search by serial number, customer name or phone" />
      <input className="scan-input mono" style={{ marginBottom: 16 }} autoFocus placeholder="Type a serial number, phone or name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <div className="alert bad" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="grid g2">
        <div className="stack">
          {r && (r.units.length > 0 || r.customers.length > 0) && (
            <Card title="Matches" pad={false}><div className="table-wrap"><table><tbody>
              {r.units.map((u) => <tr key={u.serial_no} className="clickable" onClick={() => open(u.serial_no)}><td className="mono">{u.serial_no}</td><td>{u.product_name}</td><td>{u.customer_name || '-'}</td><td><Badge status={u.warranty_state} /></td></tr>)}
              {r.customers.map((c) => <tr key={`c${c.id}`}><td colSpan={4}>👤 <b>{c.name}</b> · {c.phone} · {c.city || ''} <Link to="/customers" className="small">(customers)</Link></td></tr>)}
            </tbody></table></div></Card>)}
          {r && dq.length >= 3 && r.units.length === 0 && r.customers.length === 0 && <div className="alert info">No matches for “{dq}”.</div>}
        </div>
        {unit && (
          <Card title="Unit details" actions={<Badge status={unit.warranty_state} />}>
            <div className={`alert ${ok ? 'ok' : unit.warranty_state === 'expired' ? 'bad' : 'warn'}`} style={{ marginBottom: 14, fontSize: '1rem' }}>
              {ok ? `✓ Under warranty: ${unit.days_left} days left (until ${fmtDate(unit.warranty_end)}). Repair or replacement is free.`
                : unit.warranty_state === 'expired' ? `✗ Warranty expired on ${fmtDate(unit.warranty_end)}. Parts and labour will be billed.` : 'Warranty not started: unit has not been delivered.'}</div>
            <dl className="kv">
              <dt>Product</dt><dd><b>{unit.product_name}</b> <span className="muted mono small">({unit.sku})</span></dd><dt>Serial</dt><dd className="mono">{unit.serial_no}</dd>
              <dt>Status</dt><dd><Badge status={unit.status} /></dd><dt>Customer</dt><dd>{unit.customer_name || '-'}{unit.customer_phone && <> · <a href={`tel:${unit.customer_phone}`}>{unit.customer_phone}</a></>}<div className="muted small">{unit.customer_address}</div></dd>
              <dt>Order</dt><dd>{unit.order_no || '-'}</dd><dt>Delivered</dt><dd>{fmtDate(unit.delivered_at)}</dd><dt>Warranty term</dt><dd>{unit.warranty_months} months · starts {fmtDate(unit.warranty_start)}</dd>
              <dt>Past tickets</dt><dd>{(unit.tickets || []).length === 0 ? 'None' : unit.tickets.map((t) => <div key={t.id}><Link to={`/tickets/${t.id}`}>{t.ticketNo}</Link> · {t.subject} <Badge status={t.status} /></div>)}</dd>
            </dl>
            {unit.customer_id && can(user, 'support', 'sales') && <div style={{ marginTop: 14 }}><button className="btn" onClick={() => setRaising(true)}>Raise service ticket</button></div>}
          </Card>)}
      </div>
      {raising && <NewTicket initialSerial={unit.serial_no} onClose={() => setRaising(false)} />}
    </>
  );
}
