import { get, post } from '../api';
import { Field, Modal, fmtDate, useAction, useAsync, useForm } from './ui';
import TechPicker from './TechPicker';

/** Assign or change the technician of an installation job. Busy technicians cannot be chosen. */
export default function ScheduleTech({ orderId, job, onClose, onDone }: {
  orderId: number; job?: { id?: number; crew?: string[]; scheduled_date?: string | null }; onClose: () => void; onDone: () => void;
}) {
  const techs = useAsync(() => get('/users?role=technician'));
  const f = useForm({ tech: '', date: job?.scheduled_date || new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) });
  const { run, busy, error } = useAction(f.setErrors);
  // one technician per job: the current one is pre-selected so you only change it when needed
  const current = (techs.data || []).find((t) => (job?.crew || []).includes(t.name));
  const chosen = f.values.tech || (current ? String(current.id) : '');
  // nothing to save while the same technician is still chosen for the same date
  const unchanged = !!current && chosen === String(current.id) && f.values.date === (job?.scheduled_date || '');
  const submit = async () => {
    if (!chosen) return f.setErrors({ technicianIds: 'Choose an available technician' });
    if (unchanged) return;
    if (await run(() => post(`/orders/${orderId}/schedule`, { technicianIds: [Number(chosen)], scheduledDate: f.values.date }), 'Technician assigned')) onDone();
  };
  return (
    <Modal title={current ? 'Installation technician' : 'Assign installation technician'} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>{unchanged ? 'Close' : 'Cancel'}</button>{!unchanged && <button className="btn" onClick={submit} disabled={busy || !chosen}>{current ? 'Change technician' : 'Assign technician'}</button>}</>}>
      <div className="stack">
        {error && <div className="alert bad">{error}</div>}
        {unchanged && <div className="alert ok">{current.name} is already assigned for {fmtDate(job?.scheduled_date)}. Pick another technician or date to change it.</div>}
        <Field label="Installation date" error={f.errors.scheduledDate}><input type="date" min={new Date().toISOString().slice(0, 10)} {...f.bind('date')} /></Field>
        <Field label="Technician (choose one who is free)" error={f.errors.technicianIds}>
          <TechPicker date={f.values.date} value={chosen} onChange={(id) => f.set('tech', id)} onPickDate={(d) => f.set('date', d)} excludeJobId={job?.id} current={job?.crew} />
        </Field>
      </div>
    </Modal>
  );
}
