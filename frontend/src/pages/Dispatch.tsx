import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../api';
import { Async, Badge, Card, Empty, PageHead, fmtDateTime, label, useAsync } from '../components/ui';
import { Chips, Kpi, KpiRow, Person, Tag, ago } from '../components/kit';
import { Icon, type IconName } from '../components/icons';

export default function Dispatch() {
  const nav = useNavigate();
  const state = useAsync(() => get('/dispatches'));
  const [tab, setTab] = useState('');
  return (
    <>
      <PageHead title="Dispatch" sub="Orders ready to pack appear here as soon as the advance is received" />
      <Async state={state}>{(rows: any[]) => {
        if (rows.length === 0) return <Card><Empty>Nothing to dispatch.</Empty></Card>;
        const n = (s: string) => rows.filter((r) => r.status === s).length;
        const shown = tab ? rows.filter((r) => r.status === tab) : rows;
        return (
          <div className="page-stack">
            <KpiRow>
              <Kpi icon="box" tone="amber" label="Waiting to pack" value={n('pending')} sub="advance received" />
              <Kpi icon="search" tone="indigo" label="Being packed" value={n('packing')} sub="serials being scanned" />
              <Kpi icon="truck" tone="blue" label="On the road" value={n('dispatched')} sub="left the warehouse" />
              <Kpi icon="check" tone="green" label="Delivered" value={n('delivered')} sub="warranty clock started" />
            </KpiRow>
            <Chips value={tab} onChange={setTab} options={[{ value: '', label: 'All', count: rows.length }, ...['pending', 'packing', 'dispatched', 'delivered'].map((s) => ({ value: s, label: label(s), count: n(s) }))]} />
            <Card pad={false}>
              {shown.length === 0 ? <Empty>No dispatches at this stage.</Empty> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Order</th><th>Customer</th><th>Serials scanned</th><th>Vehicle</th><th>Left warehouse</th><th>Status</th><th /></tr></thead>
                  <tbody>{shown.map((d) => (
                    <tr key={d.id} className="clickable" onClick={() => nav(`/dispatch/${d.id}`)}>
                      <td><b>{d.order_no}</b></td>
                      <td><Person name={d.customer_name} sub={d.city} /></td>
                      <td><Tag tone={d.scanned > 0 ? 'blue' : 'slate'}>{d.scanned} scanned</Tag></td>
                      <td>{d.vehicle_no ? <Tag tone="slate"><span className="mono">{d.vehicle_no}</span></Tag> : <span className="muted">-</span>}</td>
                      <td className="nowrap">{d.dispatched_at ? <><b className="soft">{ago(d.dispatched_at)}</b><span className="sub-line">{fmtDateTime(d.dispatched_at)}</span></> : <span className="muted">Not yet</span>}</td>
                      <td><Badge status={d.status} /></td>
                      <td className="row-go"><Icon n="arrow" /></td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </Card>
          </div>
        );
      }}</Async>
    </>
  );
}
