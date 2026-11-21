import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, get, post, del } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Field, PageHead, fmtDateTime, money, useAction, useAsync, useToast } from '../components/ui';

export default function DispatchDetail() {
  const { id } = useParams();
  const user = useCurrentUser();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [serial, setSerial] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [vErr, setVErr] = useState('');
  const [scanMsg, setScanMsg] = useState<any>(null);
  const inputRef = useRef<any>(null);
  const toast = useToast();
  const { run, busy } = useAction();
  const wh = can(user, 'warehouse');

  const load = () => get(`/dispatches/${id}`).then(setData).catch(setError);
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  // Barcode scanners type the serial then press Enter, so submit on Enter
  const scan = async (e) => {
    e.preventDefault();
    const s = serial.trim().toUpperCase();
    if (!s) return;
    setScanMsg(null);
    try {
      setData(await post(`/dispatches/${id}/scan`, { serial: s }));
      setScanMsg({ ok: true, text: `✓ ${s} added` });
      setSerial('');
    } catch (err) { setScanMsg({ ok: false, text: err.fields?.serial || err.message }); }
    inputRef.current?.focus();
  };
  const unscan = async (s) => { if (await run(() => del(`/dispatches/${id}/scan/${s}`))) load(); };
  const send = async () => {
    if (!vehicle.trim()) return setVErr('Enter the vehicle number');
    setVErr('');
    try { setData(await post(`/dispatches/${id}/dispatch`, { vehicleNo: vehicle })); toast('Truck dispatched'); }
    catch (err) { setVErr(err.fields?.vehicleNo || err.message); }
  };

  if (error) return <div className="alert bad">{error.message}</div>;
  if (!data) return <div className="spinner" />;
  const d = data;
  const open = ['pending', 'packing'].includes(d.status);
  const tracked = d.items.filter((i) => i.tracked_serial);
  const scannedTotal = tracked.reduce((s, i) => s + i.scannedCount, 0);
  const requiredTotal = tracked.reduce((s, i) => s + i.required, 0);

  return (
    <>
      <PageHead crumb={<div className="crumb"><Link to="/dispatch">← Dispatch</Link></div>} title={`Dispatch · ${d.order_no}`} sub={<>{d.customer_name} · {d.address}{d.city ? `, ${d.city}` : ''} · <Badge status={d.status} /></>}
        actions={wh && d.status === 'dispatched' && <button className="btn ok" disabled={busy} onClick={async () => { if (await run(() => post(`/dispatches/${id}/deliver`), 'Delivery confirmed: warranty started')) load(); }}>✓ Mark delivered</button>} />

      {d.status === 'delivered' && <div className="alert ok" style={{ marginBottom: 16 }}>Delivered {fmtDateTime(d.delivered_at)}. The warranty clock started automatically for every serial number below.</div>}

      {open && wh && (
        <Card title="Scan serial numbers">
          <form onSubmit={scan} className="stack">
            <input ref={inputRef} className="scan-input mono" autoFocus placeholder="Scan or type serial number, then press Enter" value={serial} onChange={(e) => setSerial(e.target.value)} />
            {scanMsg && <div className={`alert ${scanMsg.ok ? 'ok' : 'bad'}`} role="alert">{scanMsg.text}</div>}
            <div className="progress"><i style={{ width: `${requiredTotal ? (scannedTotal / requiredTotal) * 100 : 0}%` }} /></div>
            <span className="muted small">{scannedTotal} of {requiredTotal} serial-numbered units scanned</span>
          </form>
        </Card>
      )}

      <div style={{ marginTop: 16 }}><Card title={`Pick list · value ${money(d.value)}`} pad={false}>
        <div className="table-wrap"><table>
          <thead><tr><th>Item</th><th className="num">Needed</th><th>Scanned serials</th><th>State</th></tr></thead>
          <tbody>{d.items.map((l) => (
            <tr key={l.product_id} className={l.complete ? 'line-done' : ''}>
              <td><b>{l.name}</b><div className="mono muted small">{l.sku}</div></td><td className="num">{l.required}</td>
              <td>{l.tracked_serial ? (l.scanned.length ? l.scanned.map((s) => (
                <div key={s} className="mono small">{s} {open && wh && <button className="btn sm secondary" style={{ padding: '0 6px', minHeight: 22 }} onClick={() => unscan(s)} aria-label={`Remove ${s}`}>✕</button>}</div>)) : <span className="muted">none scanned</span>)
                : <span className="muted">{l.on_hand} in stock (bulk item, no scan)</span>}</td>
              <td>{l.complete ? <Badge status="ok">{open ? 'Ready' : 'Done'}</Badge> : <Badge status="pending">{l.tracked_serial ? `${l.scannedCount}/${l.required}` : 'Short on stock'}</Badge>}</td></tr>))}</tbody>
        </table></div></Card></div>

      {open && wh && (
        <div style={{ marginTop: 16 }}><Card title="Release to truck">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Field label="Vehicle number" error={vErr} className="grow"><input placeholder="GJ05AB1234" value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} /></Field>
            <button className="btn" style={{ marginTop: 24 }} disabled={!d.ready} onClick={send}>🚚 Dispatch</button>
          </div>
          {!d.ready && <p className="muted small" style={{ marginBottom: 0 }}>Dispatch is enabled once every serial-numbered item is scanned and bulk items are in stock.</p>}
        </Card></div>
      )}
      {d.vehicle_no && !open && <p className="muted">Vehicle {d.vehicle_no} · left {fmtDateTime(d.dispatched_at)}</p>}
    </>
  );
}
