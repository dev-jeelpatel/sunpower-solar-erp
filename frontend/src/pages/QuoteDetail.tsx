import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { del, get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Confirm, PageHead, fmtDate, money, useAction, useAsync } from '../components/ui';

export default function QuoteDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = useCurrentUser();
  const state = useAsync(() => get(`/quotes/${id}`), [id]);
  const { run, busy } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [delAsk, setDelAsk] = useState(false);
  const act = async (path, msg) => { if (await run(() => post(`/quotes/${id}/${path}`), msg)) state.reload(); };

  return (
    <Async state={state}>{(q) => (
      <>
        <PageHead crumb={<div className="crumb no-print"><Link to="/quotes">← Quotes</Link></div>} title={q.quote_no} sub={<><Badge status={q.status} /> {q.expired && q.status !== 'accepted' && <Badge status="expired">Expired</Badge>}</>}
          actions={<div className="no-print row">
            <button className="btn secondary" onClick={() => window.print()}>🖨️ Print / PDF</button>
            {can(user, 'sales') && q.status === 'draft' && <button className="btn" disabled={busy} onClick={() => act('send', 'Quote marked as sent')}>Mark as sent to customer</button>}
            {can(user, 'sales') && q.status === 'sent' && <><button className="btn secondary" disabled={busy} onClick={() => act('reject', 'Quote rejected')}>Customer declined</button>
              <button className="btn ok" disabled={busy || q.expired} onClick={() => setConfirm(true)}>Customer accepted → create order</button></>}
            {can(user, 'sales') && ['draft', 'rejected'].includes(q.status) && <button className="btn secondary danger-text" onClick={() => setDelAsk(true)}>Delete</button>}
            {q.order && <Link className="btn" to={`/orders/${q.order.id}`}>View order {q.order.order_no}</Link>}
          </div>} />
        <Card>
          <div className="grid g2" style={{ marginBottom: 18 }}>
            <div><div className="muted small">Prepared for</div><b>{q.customer_name}</b><div>{q.address}{q.city ? `, ${q.city}` : ''}</div><div className="muted">{q.phone}</div></div>
            <div style={{ textAlign: 'right' }}><div className="muted small">{q.package_name}</div><div>Issued {fmtDate(q.created_at)}</div><div>Valid until <b>{fmtDate(q.valid_until)}</b></div><div className="muted small">Prepared by {q.created_by_name}</div></div>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
            <tbody>{q.items.map((i) => <tr key={i.id}><td>{i.description}</td><td className="num">{i.quantity}</td><td className="num">{money(i.unit_price)}</td><td className="num">{money(i.line_total)}</td></tr>)}</tbody>
            <tfoot>
              <tr><td colSpan={3} className="right muted">Subtotal</td><td className="num">{money(q.subtotal)}</td></tr>
              {q.discount > 0 && <tr><td colSpan={3} className="right muted">Discount</td><td className="num">- {money(q.discount)}</td></tr>}
              <tr><td colSpan={3} className="right muted">GST @ {q.tax_percent}%</td><td className="num">{money(q.tax_amount, true)}</td></tr>
              <tr><td colSpan={3} className="right"><b>Total payable</b></td><td className="num"><b style={{ fontSize: '1.15rem' }}>{money(q.total, true)}</b></td></tr>
            </tfoot>
          </table></div>
          {q.subsidy_required && <p className="alert info" style={{ marginTop: 16 }}>Government subsidy support is included: we handle the paperwork for you.</p>}
        </Card>
        {confirm && <Confirm title="Create order?" yesLabel="Create order" message="This converts the quote into an order and generates the invoice. The customer then pays the advance to confirm it."
          onNo={() => setConfirm(false)} onYes={async () => { setConfirm(false); const r = await run(() => post(`/quotes/${id}/accept`), 'Order created'); if (r?.id) nav(`/orders/${r.id}`); }} />}
        {delAsk && <Confirm danger yesLabel="Delete" title="Delete this quote?" onNo={() => setDelAsk(false)} onYes={async () => { setDelAsk(false); if (await run(() => del(`/quotes/${id}`), 'Quote deleted')) nav('/quotes'); }} message={<>{q.quote_no} for {q.customer_name} will be removed. Only drafts and declined quotes can be deleted.</>} />}
      </>
    )}</Async>
  );
}
