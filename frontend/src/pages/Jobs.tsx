import { useNavigate } from 'react-router-dom';
import { get } from '../api';
import { useCurrentUser } from '../auth';
import { Async, Badge, Card, Empty, PageHead, fmtDate, useAsync } from '../components/ui';

export default function Jobs() {
  const user = useCurrentUser();
  const nav = useNavigate();
  const state = useAsync(() => get('/jobs'));
  return (
    <>
      <PageHead title="Installation jobs" sub={user.role === 'technician' ? 'Your schedule' : 'Crew schedule'} />
      <Async state={state}>{(rows) => rows.length === 0 ? <Card><Empty>No jobs scheduled.</Empty></Card> : (
        <div className="grid g3">{rows.map((j) => (
          <div key={j.id} className="card card-pad stack" style={{ cursor: 'pointer', gap: 8 }} onClick={() => nav(`/jobs/${j.id}`)}>
            <div className="row between"><b>{j.customer_name}</b><Badge status={j.status} /></div>
            <div className="muted small">{j.address}{j.city ? `, ${j.city}` : ''}</div>
            <div>{j.package_name}</div>
            <div className="row between small"><span>📅 {fmtDate(j.scheduled_date)}</span><span className="muted">{(j.crew || []).join(', ')}</span></div>
            {j.status !== 'completed' && j.dispatch_status !== 'delivered' && <span className="badge warn" style={{ alignSelf: 'flex-start' }}>Materials: {j.dispatch_status || 'not ready'}</span>}
          </div>))}</div>)}</Async>
    </>
  );
}
