'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StatusBadge, PriorityBadge } from './StatusBadge';
import { timeFromNow } from '@/lib/format';

// Dashboard for one department. The head sees their own department
// (deptId is ignored by the API), the admin passes a deptId.
// Shared by the head page and the admin department page.
export default function DepartmentDashboard({ deptId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = deptId ? `/api/dashboard/department?deptId=${deptId}` : '/api/dashboard/department';
    fetch(url)
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)));
  }, [deptId]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading...</p>;

  const { stats, byStatus, byPriority, staff, attention, slowTickets } = data;
  // The largest count sets the full width of the bars.
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.count));

  return (
    <>
      <h1>{stats.dept_name}</h1>
      <p className="subtitle">SLA: {stats.sla_hours} hours (HIGH priority tickets get half of that)</p>

      <div className="stats">
        <div className="stat">
          <div className="value">{stats.total_tickets}</div>
          <div className="label">Total tickets</div>
        </div>
        <div className="stat">
          <div className="value">{stats.open_tickets}</div>
          <div className="label">Open right now</div>
        </div>
        <div className="stat red">
          <div className="value">{stats.currently_escalated}</div>
          <div className="label">Escalated now</div>
        </div>
        <div className="stat">
          <div className="value">{stats.avg_resolution_hours ?? '-'}h</div>
          <div className="label">Avg. resolution time</div>
        </div>
        <div className="stat green">
          <div className="value">{stats.within_sla_pct ?? '-'}%</div>
          <div className="label">Resolved within SLA</div>
        </div>
        <div className="stat">
          <div className="value">{stats.avg_rating ?? '-'}</div>
          <div className="label">Avg. citizen rating</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Needs attention</h2>
          <p className="muted">Escalated, overdue or unassigned tickets.</p>
          {attention.length === 0 ? (
            <p className="empty">Nothing pending. Good job!</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assigned</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {attention.map((t) => (
                    <tr key={t.ticket_id} className={t.is_overdue ? 'overdue' : ''}>
                      <td>{t.ticket_id}</td>
                      <td>
                        <Link href={`/tickets/${t.ticket_id}`}>{t.title}</Link>
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td>
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td>{t.assigned_to_name || <span className="muted">-</span>}</td>
                      <td className="muted">{timeFromNow(t.due_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2>Tickets by status</h2>
            <table>
              <tbody>
                {byStatus.map((s) => (
                  <tr key={s.status_code}>
                    <td>{s.label}</td>
                    <td style={{ width: '50%' }}>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${(s.count / maxStatus) * 100}%` }} />
                      </div>
                    </td>
                    <td>{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Open tickets by priority</h2>
            {byPriority.length === 0 && <p className="muted">No open tickets.</p>}
            {byPriority.map((p) => (
              <div key={p.priority} className="row spread" style={{ marginBottom: 6 }}>
                <PriorityBadge priority={p.priority} />
                <strong>{p.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Staff workload</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Designation</th>
                <th>Available</th>
                <th>Active tickets</th>
                <th>Resolved</th>
                <th>Avg. hours to resolve</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.staff_id}>
                  <td>
                    {s.full_name} {s.role === 'dept_head' && <span className="muted">(Head)</span>}
                    {!s.is_active && <span className="muted"> (deactivated)</span>}
                  </td>
                  <td>{s.designation}</td>
                  <td>{s.is_available ? 'Yes' : 'No'}</td>
                  <td>{s.active_tickets}</td>
                  <td>{s.resolved_tickets}</td>
                  <td>{s.avg_resolution_hours ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Slower than department average</h2>
        <p className="muted">Resolved tickets that took longer than the average for this department.</p>
        {slowTickets.length === 0 ? (
          <p className="empty">None.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Handled by</th>
                <th>Hours taken</th>
              </tr>
            </thead>
            <tbody>
              {slowTickets.map((t) => (
                <tr key={t.ticket_id}>
                  <td>{t.ticket_id}</td>
                  <td>
                    <Link href={`/tickets/${t.ticket_id}`}>{t.title}</Link>
                  </td>
                  <td>{t.assigned_to_name || '-'}</td>
                  <td>{t.hours_taken}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
