import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../api';
import { useCurrentUser } from '../auth';
import { Async, Badge, Card, Empty, PageHead, fmtDate, label, useAsync } from '../components/ui';
import { Avatar, Chips, Kpi, KpiRow, Tag, dueIn } from '../components/kit';
import { Icon, type IconName } from '../components/icons';

const JOB_COLOR: Record<string, string> = { unscheduled: '#94a3b8', scheduled: '#6366f1', completed: '#10b981' };

export default function Jobs() {
  const user = useCurrentUser();
  const nav = useNavigate();
  const state = useAsync(() => get('/jobs'));
  const [tab, setTab] = useState('');
  return (
    <>
      <PageHead title="Installation jobs" sub={user.role === 'technician' ? 'Your schedule' : 'Crew schedule'} />
      <Async state={state}>{(rows: any[]) => {
        if (rows.length === 0) return <Card><Empty>No jobs scheduled.</Empty></Card>;
        const n = (s: string) => rows.filter((r) => r.status === s).length;
        const notReady = rows.filter((j) => j.status !== 'completed' && j.dispatch_status !== 'delivered').length;
        const shown = tab ? rows.filter((r) => r.status === tab) : rows;
        return (
          <div className="page-stack">
            <KpiRow>
              <Kpi icon="calendar" tone="indigo" label="Scheduled" value={n('scheduled')} sub="on the crew calendar" />
              <Kpi icon="clock" tone="amber" label="Unscheduled" value={n('unscheduled')} sub="waiting for a date" />
              <Kpi icon="truck" tone={notReady ? 'rose' : 'green'} label="Materials not delivered" value={notReady} sub={notReady ? 'jobs that cannot start yet' : 'all jobs have materials'} />
              <Kpi icon="check" tone="green" label="Completed" value={n('completed')} sub="signed off by customers" />
            </KpiRow>
            <Chips value={tab} onChange={setTab} options={[{ value: '', label: 'All', count: rows.length }, ...['scheduled', 'unscheduled', 'completed'].map((s) => ({ value: s, label: label(s), count: n(s), color: JOB_COLOR[s] }))]} />
            {shown.length === 0 ? <Card><Empty>No jobs at this stage.</Empty></Card> : (
              <div className="jobs">{shown.map((j) => {
                const d = dueIn(j.scheduled_date);
                const crew: string[] = j.crew || [];
                return (
                  <button key={j.id} className="job" style={{ '--jt': JOB_COLOR[j.status] || '#6366f1' } as any} onClick={() => nav(`/jobs/${j.id}`)}>
                    <div className="job-top">
                      <div><h3>{j.customer_name}</h3><div className="job-addr"><Icon n="pin" /><span>{j.address}{j.city ? `, ${j.city}` : ''}</span></div></div>
                      <Badge status={j.status} />
                    </div>
                    <div className="tags"><Tag tone="blue">{j.package_name}</Tag>{j.capacity_kw && <Tag tone="violet">{j.capacity_kw} kW</Tag>}</div>
                    <div className="job-when">
                      <div><b>{j.scheduled_date ? fmtDate(j.scheduled_date) : 'Not scheduled'}</b><span>{j.status === 'completed' ? 'Signed off' : j.scheduled_date ? d.text : 'Waiting for a date'}</span></div>
                      <Icon n="calendar" size={20} />
                    </div>
                    <div className="crew">{crew.map((c) => <Avatar key={c} name={c} mini role="technician" />)}<small>{crew.join(', ') || 'No crew assigned yet'}</small></div>
                    {j.status !== 'completed' && (j.dispatch_status === 'delivered'
                      ? <Tag tone="green">Materials delivered</Tag>
                      : <Tag tone="amber">Materials: {j.dispatch_status ? label(j.dispatch_status) : 'not ready'}</Tag>)}
                  </button>
                );
              })}</div>
            )}
          </div>
        );
      }}</Async>
    </>
  );
}
