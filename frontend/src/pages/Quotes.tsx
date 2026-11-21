import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../api';
import { Async, Badge, Card, Empty, PageHead, Pager, fmtDate, label, money, useAsync } from '../components/ui';
import { Chips, Kpi, KpiRow, Person, Tag, ago, dueIn } from '../components/kit';
import { Icon } from '../components/icons';

export default function Quotes() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const state = useAsync(() => get(`/quotes?page=${page}&status=${status}`), [page, status]);
  // Summary numbers come from the latest 100 quotes
  const all = useAsync(() => get('/quotes?limit=100'), []);
  const items: any[] = all.data?.items || [];
  const sum = (st: string[]) => items.filter((q) => st.includes(q.status)).reduce((a, q) => a + Number(q.total), 0);
  const cnt = (st: string) => items.filter((q) => q.status === st).length;
  const accepted = cnt('accepted'), decided = accepted + cnt('rejected');
  return (
    <>
      <PageHead title="Quotes" sub="Created from package templates once the site survey is approved" />
      <div className="page-stack">
        <KpiRow>
          <Kpi icon="doc" tone="indigo" label="Open quote value" value={money(sum(['draft', 'sent']))} sub={`${cnt('draft') + cnt('sent')} quotes in play`} />
          <Kpi icon="inbox" tone="amber" label="Waiting for the customer" value={cnt('sent')} sub="sent, no answer yet" />
          <Kpi icon="check" tone="green" label="Accepted" value={accepted} sub={`${money(sum(['accepted']))} won`} />
          <Kpi icon="trend" tone="violet" label="Win rate" value={decided ? `${Math.round((accepted / decided) * 100)}%` : '-'} sub={`${accepted} of ${decided} decided`} />
        </KpiRow>
        <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { value: '', label: 'All', count: items.length },
          ...['draft', 'sent', 'accepted', 'rejected'].map((s) => ({ value: s, label: label(s), count: cnt(s) })),
        ]} />
        <Card pad={false}>
          <Async state={state}>{(d) => d.items.length === 0 ? <Empty>No quotes yet. Open an enquiry with an approved survey to create one.</Empty> : (
            <><div className="table-wrap"><table>
              <thead><tr><th>Quote</th><th>Customer</th><th>Package</th><th className="num">Total</th><th>Valid until</th><th>Status</th><th /></tr></thead>
              <tbody>{d.items.map((q) => {
                const v = dueIn(q.valid_until);
                const open = ['draft', 'sent'].includes(q.status);
                return (
                  <tr key={q.id} className="clickable" onClick={() => nav(`/quotes/${q.id}`)}>
                    <td><b>{q.quote_no}</b><span className="sub-line">{ago(q.created_at)}</span></td>
                    <td><Person name={q.customer_name} /></td>
                    <td><Tag tone="blue">{q.package_name}</Tag></td>
                    <td className="num"><span className="amt">{money(q.total)}</span></td>
                    <td className="nowrap">{fmtDate(q.valid_until)}{open && <span className="sub-line" style={{ color: v.days < 0 ? 'var(--bad)' : v.days <= 3 ? 'var(--warn)' : undefined }}>{v.days < 0 ? 'Expired' : v.text}</span>}</td>
                    <td><Badge status={q.status} /></td>
                    <td className="row-go"><Icon n="arrow" /></td>
                  </tr>
                );
              })}</tbody>
            </table></div><Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} /></>)}</Async>
        </Card>
      </div>
    </>
  );
}
