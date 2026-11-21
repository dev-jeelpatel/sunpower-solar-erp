import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Empty, PageHead, Pager, fmtDate, fmtDateTime, label, money, useAsync } from '../components/ui';
import { Chips, Kpi, KpiRow, Meter, Person, Tag } from '../components/kit';
import { Icon } from '../components/icons';
import { PaymentModal } from './OrderDetail';

export default function Invoices() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const state = useAsync(() => get(`/invoices?page=${page}&status=${status}&kind=${kind}`), [page, status, kind]);
  const all = useAsync(() => get('/invoices?limit=100'), []);
  const items: any[] = all.data?.items || [];
  const live = items.filter((i) => i.status !== 'void');
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = live.filter((i) => i.status !== 'paid' && String(i.due_date) < todayStr);
  const cnt = (s: string) => items.filter((i) => i.status === s).length;
  const invoiced = live.reduce((a, i) => a + Number(i.total), 0);
  const collected = live.reduce((a, i) => a + Number(i.paid), 0);
  return (
    <>
      <PageHead title="Invoices & payments" sub="Order invoices and after-sales service bills" />
      <div className="page-stack">
        <KpiRow>
          <Kpi icon="doc" tone="indigo" label="Invoiced" value={money(invoiced)} sub={`${live.length} invoices`} />
          <Kpi icon="wallet" tone="green" label="Collected" value={money(collected)} sub={invoiced ? `${Math.round((collected / invoiced) * 100)}% of invoiced` : ''} />
          <Kpi icon="clock" tone="amber" label="Outstanding" value={money(invoiced - collected)} sub={`${cnt('sent') + cnt('partially_paid')} invoices open`} />
          <Kpi icon="alert" tone="rose" label="Overdue" value={overdue.length} sub={overdue.length ? `${money(overdue.reduce((a, i) => a + Number(i.total) - Number(i.paid), 0))} past due` : 'nothing overdue'} />
        </KpiRow>
        <div className="row between" style={{ gap: 12 }}>
          <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
            { value: '', label: 'All', count: items.length },
            ...['sent', 'partially_paid', 'paid', 'void'].map((s) => ({ value: s, label: label(s), count: cnt(s) })),
          ]} />
          <div className="viewtog" role="group" aria-label="Invoice type">
            {[['', 'All types'], ['order', 'Orders'], ['service', 'Service']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setPage(1); }}>{l}</button>)}
          </div>
        </div>
        <Card pad={false}>
          <Async state={state}>{(d) => d.items.length === 0 ? <Empty>No invoices match.</Empty> : (
            <><div className="table-wrap"><table>
              <thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th className="num">Total</th><th style={{ width: 190 }}>Paid</th><th>Status</th><th /></tr></thead>
              <tbody>{d.items.map((i) => {
                const late = i.status !== 'paid' && i.status !== 'void' && String(i.due_date) < todayStr;
                return (
                  <tr key={i.id} className="clickable" onClick={() => nav(`/invoices/${i.id}`)}>
                    <td className="nowrap"><b>{i.invoice_no}</b><span className="sub-line"><Tag tone={i.kind === 'service' ? 'violet' : 'blue'}>{i.kind === 'service' ? 'Service' : 'Order'}</Tag></span></td>
                    <td><Person name={i.customer_name} /></td>
                    <td className="nowrap">{fmtDate(i.issued_at)}</td>
                    <td className="nowrap">{fmtDate(i.due_date)}{late && <span className="sub-line" style={{ color: 'var(--bad)', fontWeight: 600 }}>Overdue</span>}</td>
                    <td className="num"><span className="amt">{money(i.total)}</span></td>
                    <td><Meter value={Number(i.paid)} max={Number(i.total)} tone={Number(i.paid) >= Number(i.total) ? 'green' : late ? 'rose' : 'indigo'} caption={money(i.paid)} /></td>
                    <td><Badge status={i.status} /></td>
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
