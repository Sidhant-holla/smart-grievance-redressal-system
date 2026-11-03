import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError } from '@/lib/api';
import { runEscalationCheck } from '@/lib/escalation';

// GET /api/dashboard/department?deptId=
// Head: always their own department. Admin: any department.
export async function GET(request) {
  const { user, error } = await requireRole('dept_head', 'admin');
  if (error) return error;

  const deptId = user.role === 'dept_head' ? user.deptId : Number(new URL(request.url).searchParams.get('deptId'));
  if (!deptId) return jsonError('deptId is required');

  await runEscalationCheck();

  const stats = await query('SELECT * FROM v_department_stats WHERE dept_id = $1', [deptId]);
  if (stats.rowCount === 0) return jsonError('Department not found', 404);

  // how many tickets are in each status (GROUP BY + lookup table for display order)
  const byStatus = await query(
    `SELECT s.status_code, s.label, COUNT(t.ticket_id)::int AS count
       FROM ticket_statuses s
       LEFT JOIN tickets t ON t.status = s.status_code AND t.dept_id = $1
      GROUP BY s.status_code, s.label, s.sort_order
      ORDER BY s.sort_order`,
    [deptId]
  );

  const byPriority = await query(
    `SELECT priority, COUNT(*)::int AS count
       FROM tickets
      WHERE dept_id = $1 AND status NOT IN ('RESOLVED', 'CLOSED')
      GROUP BY priority
      ORDER BY CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`,
    [deptId]
  );

  const staff = await query('SELECT * FROM v_staff_workload WHERE dept_id = $1 ORDER BY active_tickets DESC', [deptId]);

  // tickets the head should look at first
  const attention = await query(
    `SELECT * FROM v_ticket_details
      WHERE dept_id = $1 AND is_open AND (status = 'ESCALATED' OR is_overdue OR assigned_to IS NULL)
      ORDER BY (status = 'ESCALATED') DESC, due_at
      LIMIT 20`,
    [deptId]
  );

  // correlated subquery: resolved tickets that took longer than this department's average
  const slowTickets = await query(
    `SELECT t.ticket_id, t.title, u.full_name AS assigned_to_name,
            ROUND((EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1) AS hours_taken
       FROM tickets t
       LEFT JOIN users u ON u.user_id = t.assigned_to
      WHERE t.dept_id = $1
        AND t.resolved_at IS NOT NULL
        AND (t.resolved_at - t.created_at) > (SELECT AVG(t2.resolved_at - t2.created_at)
                                                FROM tickets t2
                                               WHERE t2.dept_id = t.dept_id AND t2.resolved_at IS NOT NULL)
      ORDER BY hours_taken DESC
      LIMIT 10`,
    [deptId]
  );

  return NextResponse.json({
    stats: stats.rows[0],
    byStatus: byStatus.rows,
    byPriority: byPriority.rows,
    staff: staff.rows,
    attention: attention.rows,
    slowTickets: slowTickets.rows,
  });
}
