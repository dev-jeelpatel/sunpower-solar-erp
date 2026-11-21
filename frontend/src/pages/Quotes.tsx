import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../api';
import { Async, Badge, Card, Empty, PageHead, Pager, fmtDate, label, money, useAsync } from '../components/ui';

export default function Quotes() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const state = useAsync(() => get(`/quotes?page=${page}&status=${status}`), [page, status]);
  return (
    <>
      <PageHead title="Quotes" sub="Created from package templates once the site survey is approved" />
      <div className="toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>
          {['draft', 'sent', 'accepted', 'rejected'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
      </div>
      <Card pad={false}>
        <Async state={state}>{(d) => d.items.length === 0 ? <Empty>No quotes yet. Open an enquiry with an approved survey to create one.</Empty> : (
          <><div className="table-wrap"><table>
            <thead><tr><th>Quote</th><th>Customer</th><th>Package</th><th className="num">Total</th><th>Valid until</th><th>Status</th></tr></thead>
            <tbody>{d.items.map((q) => <tr key={q.id} className="clickable" onClick={() => nav(`/quotes/${q.id}`)}>
              <td><b>{q.quote_no}</b></td><td>{q.customer_name}</td><td>{q.package_name}</td><td className="num">{money(q.total)}</td><td>{fmtDate(q.valid_until)}</td><td><Badge status={q.status} /></td></tr>)}</tbody>
          </table></div><Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} /></>)}</Async>
      </Card>
    </>
  );
}
