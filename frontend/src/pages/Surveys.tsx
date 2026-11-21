import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api';
import { useCurrentUser } from '../auth';
import { Async, Badge, Card, Empty, Field, Modal, PageHead, fmtDate, label, useAction, useAsync, useForm } from '../components/ui';
import { Avatar, Chips, Kpi, KpiRow, Person, Tag, dueIn } from '../components/kit';
import { Icon } from '../components/icons';
import { validate, required, range, positive } from '../validators';

function SurveyForm({ s, onClose, onDone }) {
  const f = useForm({ roofDirection: '', roofTiltDeg: '', cableDistanceM: '', usableAreaSqft: '', notes: '' });
  const { run, busy, error } = useAction(f.setErrors);
  const submit = async () => {
    const v = f.values;
    const errs = validate(v, { roofDirection: [required('Roof direction')], roofTiltDeg: [required('Tilt'), range(0, 90, 'Tilt')], cableDistanceM: [required('Cable distance'), range(0, 500, 'Cable distance')], usableAreaSqft: [required('Usable area'), positive('Usable area')] });
    f.setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => post(`/surveys/${s.id}/complete`, { ...v, roofTiltDeg: Number(v.roofTiltDeg), cableDistanceM: Number(v.cableDistanceM), usableAreaSqft: Number(v.usableAreaSqft) }), 'Survey submitted for approval');
    if (ok) onDone();
  };
  return (
    <Modal title={`Survey: ${s.customer_name}`} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={busy}>Submit survey</button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>{s.address}{s.city ? `, ${s.city}` : ''} · {s.requested_kw} kW {s.system_type.replace('_', '-')}</p>
      {error && !Object.keys(f.errors).length && <div className="alert bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <Field label="Roof faces" required error={f.errors.roofDirection}><select {...f.bind('roofDirection')}><option value="">Select…</option>{['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Roof tilt (°)" required error={f.errors.roofTiltDeg}><input type="number" inputMode="decimal" {...f.bind('roofTiltDeg')} /></Field>
        <Field label="Cable run (m)" required error={f.errors.cableDistanceM}><input type="number" inputMode="decimal" {...f.bind('cableDistanceM')} /></Field>
        <Field label="Usable roof area (sq ft)" required error={f.errors.usableAreaSqft}><input type="number" inputMode="decimal" {...f.bind('usableAreaSqft')} /></Field>
        <Field label="Notes" className="full"><textarea {...f.bind('notes')} /></Field>
      </div>
    </Modal>
  );
}

export default function Surveys() {
  const user = useCurrentUser();
  const state = useAsync(() => get('/surveys'));
  const [open, setOpen] = useState<any>(null);
  const [tab, setTab] = useState('');
  return (
    <>
      <PageHead title="Site surveys" sub={user.role === 'technician' ? 'Roof visits assigned to you' : 'Roof measurements awaiting approval before a quote can be issued'} />
      <Async state={state}>{(rows: any[]) => {
        const n = (s: string) => rows.filter((r) => r.status === s).length;
        const shown = tab ? rows.filter((r) => r.status === tab) : rows;
        return (
          <div className="page-stack">
            <KpiRow>
              <Kpi icon="calendar" tone="amber" label="Scheduled" value={n('scheduled')} sub="roof visits still to do" />
              <Kpi icon="clock" tone="blue" label="Awaiting review" value={n('completed')} sub="submitted, needs approval" />
              <Kpi icon="check" tone="green" label="Approved" value={n('approved')} sub="ready for quoting" />
              <Kpi icon="alert" tone="rose" label="Rejected" value={n('rejected')} sub="need a fresh visit" />
            </KpiRow>
            <Chips value={tab} onChange={setTab} options={[
              { value: '', label: 'All', count: rows.length },
              ...['scheduled', 'completed', 'approved', 'rejected'].map((s) => ({ value: s, label: s === 'completed' ? 'Awaiting review' : label(s), count: n(s) })),
            ]} />
            <Card pad={false}>
              {shown.length === 0 ? <Empty>No surveys here.</Empty> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Visit</th><th>Customer</th><th>Technician</th><th>Measurements</th><th>Status</th><th /></tr></thead>
                  <tbody>{shown.map((s) => {
                    const when = dueIn(s.scheduled_date);
                    return (
                      <tr key={s.id}>
                        <td className="nowrap"><b>{fmtDate(s.scheduled_date)}</b>{s.status === 'scheduled' && <span className="sub-line" style={{ color: when.tone === 'rose' ? 'var(--bad)' : undefined }}>{when.text}</span>}</td>
                        <td><Person name={s.customer_name} sub={`${s.address}${s.city ? `, ${s.city}` : ''}`} to={`/enquiries/${s.enquiry_id}`} /></td>
                        <td><span className="who"><Avatar name={s.technician_name} mini />{s.technician_name}</span></td>
                        <td>{s.roof_direction ? (
                          <div className="tags"><Tag tone="blue">Faces {s.roof_direction}</Tag><Tag>{s.roof_tilt_deg}° tilt</Tag><Tag>{s.cable_distance_m} m cable</Tag>{s.usable_area_sqft && <Tag>{s.usable_area_sqft} sq ft</Tag>}</div>
                        ) : <span className="muted">Not measured yet</span>}</td>
                        <td><Badge status={s.status}>{s.status === 'completed' ? 'Awaiting review' : undefined}</Badge></td>
                        <td className="right">{s.status === 'scheduled' && ['technician', 'admin'].includes(user.role) && <button className="btn sm" onClick={() => setOpen(s)}>Enter measurements</button>}
                          {s.status === 'completed' && user.role !== 'technician' && <Link className="btn sm secondary" to={`/enquiries/${s.enquiry_id}`}>Review</Link>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
              )}
            </Card>
          </div>
        );
      }}</Async>
      {open && <SurveyForm s={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); state.reload(); }} />}
    </>
  );
}
