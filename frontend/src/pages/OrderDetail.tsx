import ScheduleTech from '../components/ScheduleTech';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser, can } from '../auth';
import { Async, Badge, Card, Confirm, Field, Modal, PageHead, fmtDate, fmtDateTime, label, money, useAction, useAsync, useForm } from '../components/ui';
import { Tracker } from '../components/kit';
import { validate, required, positive } from '../validators';

export function PaymentModal({ invoice, onClose, onDone, remaining }) {
  const f = useForm({ amount: remaining ? String(remaining) : '', method: 'upi', reference: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const errs = validate(f.values, { amount: [required('Amount'), positive('Amount'), (v) => (Number(v) > remaining ? `Cannot exceed the balance of ${money(remaining, true)}` : null)] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = await run(() => post(`/invoices/${invoice.id}/payments`, { amount: Number(f.values.amount), method: f.values.method, reference: f.values.reference }),
      'Payment recorded');
    if (r) onDone(r);
  };
  return (
    <Modal title={`Record payment · ${invoice.invoice_no}`} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Save payment</button></>}>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Amount (₹)" required error={f.errors.amount} hint={`Balance due ${money(remaining, true)}`}><input type="number" step="0.01" inputMode="decimal" {...f.bind('amount')} /></Field>
        <Field label="Method"><select {...f.bind('method')}>{['upi', 'cash', 'bank_transfer', 'cheque', 'card'].map((m) => <option key={m} value={m}>{label(m)}</option>)}</select></Field>
        <Field label="Reference / UTR" className="full" error={f.errors.reference}><input {...f.bind('reference')} /></Field>
      </div>
    </Modal>
  );
}

/** When each order stage was reached. */
function stageTime(o: any, stage: string): string | null {
  switch (stage) {
    case 'pending_payment': return o.created_at;
    case 'confirmed': return o.confirmed_at ?? null;
    case 'dispatched': return o.dispatch?.dispatched_at ?? null;
    case 'delivered': return o.dispatch?.delivered_at ?? null;
    case 'completed': return o.completed_at ?? null;
    default: return null;
  }
}


const STAGES = [['pending_payment', 'Order placed'], ['confirmed', 'Advance received'], ['dispatched', 'Dispatched'], ['delivered', 'Delivered'], ['completed', 'Installed & signed off']];
const STAGE_NEXT: Record<string, string> = {
  pending_payment: 'Record the advance payment to confirm the order. The warehouse and crew are then notified automatically.',
  confirmed: 'The warehouse packs the order and scans every serial number before the truck leaves.',
  dispatched: 'The shipment is on its way. Mark it delivered when it reaches the customer.',
  delivered: 'Materials are at the customer. Assign a technician for the installation; they install, upload photos and get the customer sign-off.',
  completed: 'Installed and signed off. The warranty is now running.',
};

export default function OrderDetail() {
  const { id } = useParams();
  const user = useCurrentUser();
  const state = useAsync(() => get(`/orders/${id}`), [id]);
  const [modal, setModal] = useState<any>(null);
  const { run } = useAction();
  const sales = can(user, 'sales');
  const done = () => { setModal(null); state.reload(); };

  return (
    <Async state={state}>{(o) => {
      const paid = o.invoice?.paid || 0;
      const remaining = Math.round((o.total - paid) * 100) / 100;
      const idx = STAGES.findIndex(([k]) => k === o.status);
      return (
        <>
          <PageHead crumb={<div className="crumb"><Link to="/orders">← Orders</Link></div>} title={o.order_no} sub={<>{o.customer_name} · {o.package_name} · <Badge status={o.status} /></>}
            actions={sales && <>
              {o.invoice && remaining > 0 && o.status !== 'cancelled' && <button className="btn" onClick={() => setModal('pay')}>Record payment</button>}
              {o.job && o.job.status !== 'completed' && o.dispatch?.status === 'delivered' && <button className={`btn ${(o.job.crew || []).length ? 'secondary' : ''}`} onClick={() => setModal('schedule')}>{(o.job.crew || []).length ? 'Change technician' : 'Assign technician'}</button>}
              {['pending_payment', 'confirmed'].includes(o.status) && paid === 0 && <button className="btn secondary" onClick={() => setModal('cancel')}>Cancel order</button>}
            </>} />
          {o.status === 'cancelled' ? <div className="alert bad" style={{ marginBottom: 16 }}>This order was cancelled.</div>
            : <Tracker
                steps={STAGES.map(([k, l]) => ({ key: k, label: l, at: stageTime(o, k) }))}
                current={idx} finished={o.status === 'completed'} next={STAGE_NEXT[o.status]} />}
          {o.dispatch?.status === 'delivered' && o.job && o.job.status !== 'completed' && !(o.job.crew || []).length && (
            <div className="alert warn" style={{ marginBottom: 16 }}><b>Delivered. Next step:</b> assign a technician to install it. <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => setModal('schedule')}>Assign technician</button></div>
          )}
          {o.status === 'pending_payment' && <div className="alert warn" style={{ marginBottom: 16 }}>The order is confirmed (warehouse + crew notified automatically) once <b>{money(o.advanceRequired)}</b> is received. Received so far: {money(paid)}.</div>}

          <div className="grid split">
            <div className="stack">
              <Card title="Items" pad={false}><div className="table-wrap"><table>
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit price</th></tr></thead>
                <tbody>{o.items.map((i) => <tr key={i.id}><td>{i.name}<div className="muted small mono">{i.sku}</div></td><td className="num">{i.quantity}</td><td className="num">{money(i.unit_price)}</td></tr>)}</tbody>
              </table></div></Card>
              <Card title="Payments" pad={false} actions={o.invoice && <Link className="btn secondary sm" to={`/invoices/${o.invoice.id}`}>Open invoice</Link>}>
                {o.payments.length === 0 ? <div className="empty">No payments yet</div> : <div className="table-wrap"><table>
                  <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Received by</th><th className="num">Amount</th></tr></thead>
                  <tbody>{o.payments.map((p) => <tr key={p.id}><td>{fmtDateTime(p.paid_at)}</td><td style={{ textTransform: 'capitalize' }}>{label(p.method)}</td><td>{p.reference || '-'}</td><td>{p.received_by_name || '-'}</td><td className="num">{money(p.amount, true)}</td></tr>)}</tbody>
                </table></div>}
              </Card>
            </div>
            <div className="stack">
              <Card title="Summary"><dl className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
                <dt>Customer</dt><dd><Link to={`/customers?id=${o.customer_id}`}>{o.customer_name}</Link><div className="muted small">{o.phone}</div></dd>
                <dt>Enquiry</dt><dd><Link to={`/enquiries/${o.enquiry_id}`}>Open the original enquiry</Link></dd>
                <dt>Site</dt><dd>{o.address}{o.city ? `, ${o.city}` : ''}</dd>
                <dt>Total</dt><dd><b>{money(o.total, true)}</b></dd><dt>Paid</dt><dd>{money(paid, true)}</dd><dt>Balance</dt><dd><b style={{ color: remaining > 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(remaining, true)}</b></dd>
                <dt>Quote</dt><dd><Link to={`/quotes/${o.quote_id}`}>{o.quote_no}</Link></dd></dl></Card>
              <Card title="Fulfilment"><dl className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
                <dt>Warehouse</dt><dd>{o.dispatch ? <><Link to={`/dispatch/${o.dispatch.id}`}>Dispatch</Link> <Badge status={o.dispatch.status} /></> : 'Starts after advance'}</dd>
                <dt>Installation</dt><dd>{o.job ? <><Link to={`/jobs/${o.job.id}`}>Job</Link> <Badge status={o.job.status} /><div className="muted small">{fmtDate(o.job.scheduled_date)} · {(o.job.crew || []).join(', ') || (o.dispatch?.status === 'delivered' ? 'Needs a technician' : 'Technician is assigned after delivery')}</div></> : 'Starts after advance'}</dd>
                <dt>Subsidy</dt><dd>{o.subsidy ? <><Link to="/subsidies">{o.subsidy.status.replace('_', ' ')}</Link><div className="muted small">Expected {money(o.subsidy.expected_amount)}</div></> : 'Not applicable'}</dd></dl></Card>
            </div>
          </div>
          {modal === 'pay' && <PaymentModal invoice={o.invoice} remaining={remaining} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'schedule' && <ScheduleTech orderId={o.id} job={o.job} onClose={() => setModal(null)} onDone={done} />}
          {modal === 'cancel' && <Confirm danger title="Cancel this order?" message="The invoice will be voided. This cannot be undone." yesLabel="Cancel order" onNo={() => setModal(null)}
            onYes={async () => { setModal(null); if (await run(() => post(`/orders/${id}/cancel`), 'Order cancelled')) state.reload(); }} />}
        </>
      );
    }}</Async>
  );
}
