import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, PageHead, Pager, fmtDate, fmtDateTime, label, money, useAsync } from '../components/ui';
import { PaymentModal } from './OrderDetail';

export default function Invoices() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const state = useAsync(() => get(`/invoices?page=${page}&status=${status}&kind=${kind}`), [page, status, kind]);
  return (
    <>
      <PageHead title="Invoices & payments" sub="Order invoices and after-sales service bills" />
      <div className="toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{['sent', 'partially_paid', 'paid', 'void'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}><option value="">All types</option><option value="order">Order</option><option value="service">Service</option></select>
      </div>
      <Card pad={false}>
        <Async state={state}>{(d) => d.items.length === 0 ? <Empty>No invoices.</Empty> : (
          <><div className="table-wrap"><table>
            <thead><tr><th>Invoice</th><th>Customer</th><th>Type</th><th>Issued</th><th>Due</th><th className="num">Total</th><th className="num">Paid</th><th>Status</th></tr></thead>
            <tbody>{d.items.map((i) => <tr key={i.id} className="clickable" onClick={() => nav(`/invoices/${i.id}`)}>
              <td><b>{i.invoice_no}</b></td><td>{i.customer_name}</td><td style={{ textTransform: 'capitalize' }}>{i.kind}</td><td>{fmtDate(i.issued_at)}</td>
              <td style={{ color: i.status !== 'paid' && i.status !== 'void' && i.due_date < new Date().toISOString().slice(0, 10) ? 'var(--bad)' : undefined }}>{fmtDate(i.due_date)}</td>
              <td className="num">{money(i.total)}</td><td className="num">{money(i.paid)}</td><td><Badge status={i.status} /></td></tr>)}</tbody>
          </table></div><Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} /></>)}</Async>
      </Card>
    </>
  );
}

export function InvoiceDetail() {
  const { id } = useParams();
  const user = useCurrentUser();
  const state = useAsync(() => get(`/invoices/${id}`), [id]);
  const [paying, setPaying] = useState(false);
  return (
    <Async state={state}>{(i) => {
      const bal = Math.round((i.total - i.paid) * 100) / 100;
      return (
        <>
          <PageHead crumb={<div className="crumb no-print"><Link to="/invoices">← Invoices</Link></div>} title={i.invoice_no} sub={<Badge status={i.status} />}
            actions={<div className="row no-print"><button className="btn secondary" onClick={() => window.print()}>🖨️ Print / PDF</button>
              {can(user, 'sales') && bal > 0 && i.status !== 'void' && <button className="btn" onClick={() => setPaying(true)}>Record payment</button>}</div>} />
          <Card>
            <div className="grid g2" style={{ marginBottom: 18 }}>
              <div><div className="muted small">Billed to</div><b>{i.customer_name}</b><div>{i.address}{i.city ? `, ${i.city}` : ''}</div><div className="muted">{i.phone}</div></div>
              <div style={{ textAlign: 'right' }}><div>Issued {fmtDate(i.issued_at)}</div><div>Due {fmtDate(i.due_date)}</div>
                <div className="muted small">{i.order_no ? <Link to={`/orders/${i.order_id}`}>{i.order_no}</Link> : i.ticket_no ? <Link to={`/tickets/${i.ticket_id}`}>{i.ticket_no}</Link> : ''}</div></div>
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
              <tbody>{i.items.map((it) => <tr key={it.id}><td>{it.description}</td><td className="num">{it.quantity}</td><td className="num">{money(it.unit_price, true)}</td><td className="num">{money(it.quantity * it.unit_price, true)}</td></tr>)}</tbody>
              <tfoot>
                <tr><td colSpan={3} className="right muted">Subtotal</td><td className="num">{money(i.subtotal, true)}</td></tr>
                <tr><td colSpan={3} className="right muted">GST</td><td className="num">{money(i.tax_amount, true)}</td></tr>
                <tr><td colSpan={3} className="right"><b>Total</b></td><td className="num"><b>{money(i.total, true)}</b></td></tr>
                <tr><td colSpan={3} className="right muted">Paid</td><td className="num">{money(i.paid, true)}</td></tr>
                <tr><td colSpan={3} className="right"><b>Balance due</b></td><td className="num"><b style={{ color: bal > 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(bal, true)}</b></td></tr>
              </tfoot>
            </table></div>
          </Card>
          {i.payments.length > 0 && <div style={{ marginTop: 16 }}><Card title="Payments received" pad={false}><div className="table-wrap"><table><tbody>
            {i.payments.map((p) => <tr key={p.id}><td>{fmtDateTime(p.paid_at)}</td><td style={{ textTransform: 'capitalize' }}>{label(p.method)}</td><td>{p.reference || '-'}</td><td>{p.received_by_name}</td><td className="num">{money(p.amount, true)}</td></tr>)}</tbody></table></div></Card></div>}
          {paying && <PaymentModal invoice={i} remaining={bal} onClose={() => setPaying(false)} onDone={() => { setPaying(false); state.reload(); }} />}
        </>
      );
    }}</Async>
  );
}
