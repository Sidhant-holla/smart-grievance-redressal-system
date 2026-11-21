import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/api';
import { runEscalationCheck } from '@/lib/escalation';

// GET /api/dashboard/admin - system wide numbers and reports
export async function GET() {
  const { error } = await requireRole('admin');
  if (error) return error;

  await runEscalationCheck();

  // FILTER counts only the rows that match, so one query gives several totals.
  const totals = await query(
    `SELECT COUNT(*)::int                                              AS total,
            COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED', 'CLOSED'))::int AS open,
            COUNT(*) FILTER (WHERE status = 'ESCALATED')::int           AS escalated,
            COUNT(*) FILTER (WHERE possible_duplicate_of IS NOT NULL)::int AS flagged_duplicates,
            (SELECT COUNT(*) FROM ticket_supporters)::int               AS supporters,
            (SELECT COUNT(*) FROM users WHERE is_active)::int           AS active_users
       FROM tickets`
  );

  // One row per department, from the view.
  const departments = await query('SELECT * FROM v_department_stats ORDER BY open_tickets DESC, dept_name');

  // last 8 weeks: created vs resolved per week.
  // Two separate subqueries are used instead of one join, otherwise a week
  // with 3 created and 2 resolved tickets would be counted as 3 x 2 rows.
  const weekly = await query(
    `SELECT to_char(w.week, 'DD Mon') AS week,
            (SELECT COUNT(*) FROM tickets t
              WHERE date_trunc('week', t.created_at) = w.week)::int  AS created,
            (SELECT COUNT(*) FROM tickets t
              WHERE date_trunc('week', t.resolved_at) = w.week)::int AS resolved
       FROM generate_series(date_trunc('week', now()) - interval '7 weeks',
                            date_trunc('week', now()), interval '1 week') AS w(week)
      ORDER BY w.week`
  );

  // GROUP BY + HAVING: departments that keep missing their SLA
  const problemDepartments = await query(
    `SELECT d.name AS dept_name,
            COUNT(*)::int AS escalated_tickets,
            SUM(t.escalation_count)::int AS total_escalations,
            MAX(t.escalation_count) AS worst_ticket
       FROM tickets t
       JOIN departments d ON d.dept_id = t.dept_id
      WHERE t.escalation_count > 0
      GROUP BY d.dept_id, d.name
     HAVING COUNT(*) >= 2
      ORDER BY escalated_tickets DESC`
  );

  // same issue reported by many people
  // supporter_count is calculated in v_ticket_details.
  const mostSupported = await query(
    `SELECT ticket_id, title, dept_name, status, supporter_count
       FROM v_ticket_details
      WHERE supporter_count > 0
      ORDER BY supporter_count DESC, created_at DESC
      LIMIT 5`
  );

  const topStaff = await query(
    `SELECT full_name, dept_name, resolved_tickets, active_tickets, avg_resolution_hours
       FROM v_staff_workload
      WHERE resolved_tickets > 0
      ORDER BY resolved_tickets DESC, avg_resolution_hours
      LIMIT 5`
  );

  return NextResponse.json({
    totals: totals.rows[0],
    departments: departments.rows,
    weekly: weekly.rows,
    problemDepartments: problemDepartments.rows,
    mostSupported: mostSupported.rows,
    topStaff: topStaff.rows,
  });
}
