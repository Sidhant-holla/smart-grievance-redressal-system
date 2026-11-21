import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError } from '@/lib/api';
import { loadTicketFor } from '@/lib/tickets';

// GET /api/tickets/:id  - ticket + timeline + comments
export async function GET(request, { params }) {
  const { user, error } = await requireRole();
  if (error) return error;

  const ticket = await loadTicketFor(user, Number(params.id));
  if (!ticket) return jsonError('Ticket not found', 404);

  // COALESCE shows "System" when changed_by is NULL, which means the escalation function did it.
  const history = await query(
    `SELECT h.history_id, h.old_status, h.new_status, h.changed_at,
            COALESCE(cb.full_name, 'System') AS changed_by_name,
            a.full_name AS assigned_to_name
       FROM ticket_status_history h
       LEFT JOIN users cb ON cb.user_id = h.changed_by
       LEFT JOIN users a  ON a.user_id  = h.assigned_to
      WHERE h.ticket_id = $1
      ORDER BY h.changed_at, h.history_id`,
    [ticket.ticket_id]
  );

  // citizens must not see internal staff notes
  // $2 is TRUE for staff. For citizens it is FALSE, so internal notes are filtered out in SQL.
  const comments = await query(
    `SELECT c.comment_id, c.body, c.is_internal, c.created_at, u.full_name, u.role
       FROM ticket_comments c
       JOIN users u ON u.user_id = c.user_id
      WHERE c.ticket_id = $1 AND ($2 OR c.is_internal = FALSE)
      ORDER BY c.created_at`,
    [ticket.ticket_id, user.role !== 'citizen']
  );

  // heads and admins get the staff list for the "Assign to" dropdown
  let staffList = [];
  if (user.role === 'dept_head' || user.role === 'admin') {
    const staff = await query(
      `SELECT staff_id, full_name, active_tickets, is_available
         FROM v_staff_workload
        WHERE dept_id = $1 AND is_active
        ORDER BY active_tickets, full_name`,
      [ticket.dept_id]
    );
    staffList = staff.rows;
  }

  const supported = await query('SELECT 1 FROM ticket_supporters WHERE ticket_id = $1 AND user_id = $2', [
    ticket.ticket_id,
    user.id,
  ]);

  return NextResponse.json({
    ticket,
    history: history.rows,
    comments: comments.rows,
    staffList,
    hasSupported: supported.rowCount > 0,
  });
}
