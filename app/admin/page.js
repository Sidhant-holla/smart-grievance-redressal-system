'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';

// Admin dashboard: system totals, department table, weekly trend and reports.
export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');

  // Loads every number on this page from one API call.
  function load() {
    fetch('/api/dashboard/admin')
      .then((res) => res.json())
      .then(setData);
  }

  useEffect(load, []);

  // Runs escalate_overdue_tickets() now, instead of waiting for the next automatic check.
  async function runEscalation() {
    const res = await fetch('/api/escalations/run', { method: 'POST' });
    const result = await res.json();
    setMessage(`Escalation check finished: ${result.escalated} ticket(s) escalated.`);
    load();
  }

  if (!data) return <p className="muted">Loading...</p>;

  const { totals, departments, weekly, problemDepartments, mostSupported, topStaff } = data;
  // The biggest value sets the full width of the bars in the weekly table.
  const maxWeekly = Math.max(1, ...weekly.map((w) => Math.max(w.created, w.resolved)));

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="subtitle">Overview of all departments.</p>
        </div>
        <button onClick={runEscalation}>Run escalation check now</button>
      </div>

      {message && <div className="success-msg">{message}</div>}

      <div className="stats">
        <div className="stat">
          <div className="value">{totals.total}</div>
          <div className="label">Total tickets</div>
        </div>
        <div className="stat">
          <div className="value">{totals.open}</div>
          <div className="label">Open</div>
        </div>
        <div className="stat red">
          <div className="value">{totals.escalated}</div>
          <div className="label">Escalated</div>
        </div>
        <div className="stat">
          <div className="value">{totals.flagged_duplicates}</div>
          <div className="label">Flagged as possible duplicate</div>
        </div>
        <div className="stat green">
          <div className="value">{totals.supporters}</div>
          <div className="label">Duplicates avoided (supporters)</div>
        </div>
        <div className="stat">
          <div className="value">{totals.active_users}</div>
          <div className="label">Active users</div>
        </div>
      </div>

      <div className="card">
        <h2>Departments</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th>SLA (h)</th>
                <th>Total</th>
                <th>Open</th>
                <th>Escalated now</th>
                <th>Ever escalated</th>
                <th>Avg. resolution (h)</th>
                <th>Within SLA</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.dept_id}>
                  <td>
                    <Link href={`/admin/departments/${d.dept_id}`}>{d.dept_name}</Link>
                  </td>
                  <td>{d.sla_hours}</td>
                  <td>{d.total_tickets}</td>
                  <td>{d.open_tickets}</td>
                  <td>{d.currently_escalated}</td>
                  <td>{d.ever_escalated}</td>
                  <td>{d.avg_resolution_hours ?? '-'}</td>
                  <td>{d.within_sla_pct != null ? d.within_sla_pct + '%' : '-'}</td>
                  <td>{d.avg_rating ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Last 8 weeks</h2>
          <table>
            <thead>
              <tr>
                <th>Week of</th>
                <th>Created</th>
                <th></th>
                <th>Resolved</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((w) => (
                <tr key={w.week}>
                  <td>{w.week}</td>
                  <td>{w.created}</td>
                  <td style={{ width: '30%' }}>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(w.created / maxWeekly) * 100}%` }} />
                    </div>
                  </td>
                  <td>{w.resolved}</td>
                  <td style={{ width: '30%' }}>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(w.resolved / maxWeekly) * 100}%`, background: 'var(--success)' }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Departments missing SLA</h2>
          <p className="muted">Departments with 2 or more escalated tickets (GROUP BY ... HAVING).</p>
          {problemDepartments.length === 0 ? (
            <p className="empty">None.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Tickets</th>
                  <th>Escalations</th>
                </tr>
              </thead>
              <tbody>
                {problemDepartments.map((p) => (
                  <tr key={p.dept_name}>
                    <td>{p.dept_name}</td>
                    <td>{p.escalated_tickets}</td>
                    <td>{p.total_escalations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Most reported issues</h2>
          {mostSupported.length === 0 ? (
            <p className="empty">No supported tickets yet.</p>
          ) : (
            <table>
              <tbody>
                {mostSupported.map((t) => (
                  <tr key={t.ticket_id}>
                    <td>
                      <Link href={`/tickets/${t.ticket_id}`}>
                        #{t.ticket_id} {t.title}
                      </Link>
                      <div className="muted">{t.dept_name}</div>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>{Number(t.supporter_count) + 1} people</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Top staff</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Resolved</th>
                <th>Avg. h</th>
              </tr>
            </thead>
            <tbody>
              {topStaff.map((s) => (
                <tr key={s.full_name}>
                  <td>
                    {s.full_name}
                    <div className="muted">{s.dept_name}</div>
                  </td>
                  <td>{s.resolved_tickets}</td>
                  <td>{s.avg_resolution_hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
