import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, del, get, photoUrl, post } from '../api';
import { useCurrentUser } from '../auth';
import SignaturePad from '../components/SignaturePad';
import { Async, Badge, Card, Field, PageHead, fmtDate, fmtDateTime, money, toLocalInput, useAction, useAsync, useForm, useToast } from '../components/ui';
import { validate, required, range, minLen } from '../validators';

/** Mobile-first completion form used by the crew on site. */
function CompleteForm({ job, onDone }) {
  const sig = useRef<any>(null);
  const toast = useToast();
  const now = new Date();
  const f = useForm({ startedAt: toLocalInput(new Date(now.getTime() - 4 * 3600e3)), finishedAt: toLocalInput(now), confirmedKw: job.capacity_kw || '', notes: '', signerName: job.customer_name });
  const { run, busy, error } = useAction(f.setErrors);
  const [uploading, setUploading] = useState(false);
  const [sigErr, setSigErr] = useState('');
  const fileRef = useRef<any>(null);

  const upload = async (files) => {
    if (!files.length) return;
    const bad = [...files].find((x) => !['image/jpeg', 'image/png', 'image/webp'].includes(x.type) || x.size > 5 * 1024 * 1024);
    if (bad) return toast(`${bad.name}: only JPG/PNG/WebP photos up to 5 MB are allowed`, 'bad');
    const form = new FormData();
    [...files].forEach((x) => form.append('photos', x));
    setUploading(true);
    try { await api(`/jobs/${job.id}/photos`, { method: 'POST', form }); toast('Photos uploaded'); onDone(); }
    catch (e) { toast(e.fields?.photos || e.message, 'bad'); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const submit = async (e) => {
    e.preventDefault();
    const v = f.values;
    const errs = validate(v, {
      startedAt: [required('Start time')], finishedAt: [required('Finish time'), (x) => (v.startedAt && x && new Date(x) <= new Date(v.startedAt) ? 'Finish time must be after the start time' : null),
        (x) => (new Date(x) > new Date(Date.now() + 5 * 60000) ? 'Finish time cannot be in the future' : null)],
      confirmedKw: [required('System size'), range(0.5, 10, 'System size')], signerName: [required('Customer name'), minLen(2, 'Customer name')],
      notes: [() => (job.capacity_kw && Number(v.confirmedKw) !== Number(job.capacity_kw) && !v.notes.trim() ? `Installed size differs from the ordered ${job.capacity_kw} kW: explain in notes` : null)],
    });
    if (job.photos.length < 1) errs.photos = 'Upload at least one photo of the finished roof';
    f.setErrors(errs);
    setSigErr('');
    if (sig.current.isEmpty()) { setSigErr('Ask the customer to sign on the screen'); return; }
    if (Object.keys(errs).length) return;
    const ok = await run(() => post(`/jobs/${job.id}/complete`, {
      startedAt: new Date(v.startedAt).toISOString(), finishedAt: new Date(v.finishedAt).toISOString(), confirmedKw: Number(v.confirmedKw), notes: v.notes, signerName: v.signerName, signature: sig.current.toDataURL(),
    }), 'Installation signed off 🎉');
    if (ok) onDone();
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {error && !Object.keys(f.errors).length && <div className="alert bad">{error}</div>}
      <div className="form-grid">
        <Field label="Work started" required error={f.errors.startedAt}><input type="datetime-local" {...f.bind('startedAt')} /></Field>
        <Field label="Work finished" required error={f.errors.finishedAt}><input type="datetime-local" max={toLocalInput()} {...f.bind('finishedAt')} /></Field>
        <Field label="Installed system size (kW)" required error={f.errors.confirmedKw} hint={job.capacity_kw ? `Ordered: ${job.capacity_kw} kW` : ''}><input type="number" step="0.1" inputMode="decimal" {...f.bind('confirmedKw')} /></Field>
        <Field label="Notes" error={f.errors.notes}><input {...f.bind('notes')} placeholder="Anything the customer should know" /></Field>
      </div>

      <Field label="Photos of the finished roof" required error={f.errors.photos} hint="Take photos with your phone camera or pick from gallery (JPG/PNG/WebP, 5 MB max each)">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={(e) => upload(e.target.files)} disabled={uploading} />
      </Field>
      <Photos job={job} onDone={onDone} editable />

      <div className="stack" style={{ gap: 8 }}>
        <Field label="Customer name" required error={f.errors.signerName}><input {...f.bind('signerName')} /></Field>
        <Field label="Customer signature (accepts the completed work)" required error={sigErr}><SignaturePad ref={sig} onChange={() => setSigErr('')} /></Field>
        <div><button type="button" className="btn secondary sm" onClick={() => sig.current.clear()}>Clear signature</button></div>
      </div>
      <button className="btn" style={{ minHeight: 48, fontSize: '1.05rem' }} disabled={busy || uploading}>{busy ? 'Submitting…' : '✓ Submit & sign off'}</button>
    </form>
  );
}

function Photos({ job, onDone, editable = false }) {
  const { run } = useAction();
  if (!job.photos.length) return null;
  return (
    <div className="photos">{job.photos.map((p) => (
      <div className="ph" key={p.id}><a href={photoUrl(p.url)} target="_blank" rel="noreferrer"><img src={photoUrl(p.url)} alt="Installation" loading="lazy" /></a>
        {editable && <button type="button" className="btn danger sm" style={{ position: 'absolute', top: 4, right: 4, padding: '0 8px', minHeight: 26 }} onClick={async () => { if (await run(() => del(`/jobs/${job.id}/photos/${p.id}`))) onDone(); }} aria-label="Remove photo">✕</button>}</div>))}</div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const user = useCurrentUser();
  const state = useAsync(() => get(`/jobs/${id}`), [id]);
  return (
    <Async state={state}>{(j) => (
      <>
        <PageHead crumb={<div className="crumb"><Link to="/jobs">← Jobs</Link></div>} title={j.customer_name} sub={<>{j.order_no} · {j.package_name} · <Badge status={j.status} /></>} />
        <div className="grid split">
          <div className="stack">
            {j.status === 'completed' ? (
              <Card title="Signed-off record">
                <dl className="kv"><dt>Started</dt><dd>{fmtDateTime(j.started_at)}</dd><dt>Finished</dt><dd>{fmtDateTime(j.finished_at)}</dd><dt>Duration</dt><dd>{j.labour?.hours} hours</dd>
                  <dt>Installed</dt><dd>{j.confirmed_kw} kW</dd><dt>Notes</dt><dd>{j.notes || '-'}</dd><dt>Accepted by</dt><dd>{j.signer_name} on {fmtDateTime(j.signed_at)}</dd></dl>
                {j.signature_data?.length > 100 && <div style={{ marginTop: 12 }}><div className="muted small">Customer signature</div><img src={j.signature_data} alt="Customer signature" style={{ maxWidth: 260, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} /></div>}
                <h3 style={{ marginTop: 16 }}>Photos</h3><Photos job={j} onDone={state.reload} />
              </Card>
            ) : j.dispatch_status !== 'delivered' ? (
              <Card title="Not ready yet"><div className="alert warn">Materials have not been marked delivered. The completion form opens once the delivery is confirmed.</div></Card>
            ) : ['technician', 'admin'].includes(user.role) ? (
              <Card title="Installation report"><CompleteForm job={j} onDone={state.reload} /></Card>
            ) : <Card title="In progress"><div className="muted">Waiting for the crew to submit the installation report.</div><Photos job={j} onDone={state.reload} /></Card>}
          </div>
          <div className="stack">
            <Card title="Job details"><dl className="kv" style={{ gridTemplateColumns: '90px 1fr' }}>
              <dt>Site</dt><dd>{j.address}{j.city ? `, ${j.city}` : ''}</dd><dt>Phone</dt><dd><a href={`tel:${j.phone}`}>{j.phone}</a></dd>
              <dt>Date</dt><dd>{fmtDate(j.scheduled_date)}</dd><dt>Crew</dt><dd>{j.crew.map((c) => c.name).join(', ') || '-'}</dd>
              <dt>Order</dt><dd><Link to={`/orders/${j.order_id}`}>{j.order_no}</Link></dd></dl></Card>
            <Card title="Equipment installed (serial numbers)" pad={false}>
              {j.units.length === 0 ? <div className="empty">Not dispatched yet</div> : <div className="table-wrap"><table><tbody>{j.units.map((u) => <tr key={u.serial_no}><td className="small">{u.name}</td><td className="mono small">{u.serial_no}</td></tr>)}</tbody></table></div>}
            </Card>
          </div>
        </div>
      </>
    )}</Async>
  );
}
