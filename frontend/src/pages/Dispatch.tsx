import { useNavigate } from 'react-router-dom';
import { get } from '../api';
import { Async, Badge, Card, Empty, PageHead, fmtDateTime, useAsync } from '../components/ui';

export default function Dispatch() {
  const nav = useNavigate();
  const state = useAsync(() => get('/dispatches'));
  return (
    <>
      <PageHead title="Dispatch" sub="Orders ready to pack appear here as soon as the advance is received" />
      <Card pad={false}><Async state={state}>{(rows) => rows.length === 0 ? <Empty>Nothing to dispatch.</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>City</th><th>Serials scanned</th><th>Vehicle</th><th>Left warehouse</th><th>Status</th></tr></thead>
          <tbody>{rows.map((d) => <tr key={d.id} className="clickable" onClick={() => nav(`/dispatch/${d.id}`)}>
            <td><b>{d.order_no}</b></td><td>{d.customer_name}</td><td>{d.city || '-'}</td><td>{d.scanned}</td><td className="mono">{d.vehicle_no || '-'}</td><td>{fmtDateTime(d.dispatched_at)}</td><td><Badge status={d.status} /></td></tr>)}</tbody>
        </table></div>)}</Async></Card>
    </>
  );
}
