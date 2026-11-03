import { NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { requireRole, jsonError, dbError } from '@/lib/api';
import { loadTicketFor } from '@/lib/tickets';

// POST /api/tickets/:id/action
// body: { action, staffId?, rating?, comment? }
//
// Every action runs in a transaction. The ticket row is locked first
// (SELECT ... FOR UPDATE) so two people cannot change the same ticket at
// the same time. Whether the status change itself is allowed is decided by
// the ticket_before_update trigger, not here.
export async function POST(request, { params }) {
  const { user, error } = await requireRole();
  if (error) return error;

  const ticketId = Number(params.id);
  const ticket = await loadTicketFor(user, ticketId);
  if (!ticket) return jsonError('Ticket not found', 404);

  const { action, staffId, rating, comment } = await request.json();
  const isStaff = user.role === 'staff' || user.role === 'dept_head';
  const isManager = user.role === 'dept_head' || user.role === 'admin';
  const isOwner = ticket.created_by === user.id;

  try {
    await withTransaction(async (client) => {
      const locked = await client.query('SELECT * FROM tickets WHERE ticket_id = $1 FOR UPDATE', [ticketId]);
      const current = locked.rows[0];

      const setStatus = (status, extraSql = '', extraValues = []) =>
        client.query(
          `UPDATE tickets SET status = $1, updated_by = $2 ${extraSql} WHERE ticket_id = $3`,
          [status, user.id, ticketId, ...extraValues]
        );

      const addComment = (body, isInternal = false) =>
        client.query('INSERT INTO ticket_comments (ticket_id, user_id, body, is_internal) VALUES ($1, $2, $3, $4)', [
          ticketId,
          user.id,
          body,
          isInternal,
        ]);

      switch (action) {
        case 'claim': // staff takes an unassigned ticket from the queue
          if (!isStaff) throw new Error('Only staff can pick up tickets');
          await client.query('CALL claim_ticket($1, $2)', [ticketId, user.id]);
          break;

        case 'assign': // head / admin assigns or re-assigns
          if (!isManager) throw new Error('Only the department head or admin can assign tickets');
          if (!staffId) throw new Error('Please choose a staff member');
          await client.query('CALL assign_ticket($1, $2, $3)', [ticketId, staffId, user.id]);
          break;

        case 'start':
          if (current.assigned_to !== user.id) throw new Error('Only the assigned staff member can start work');
          await setStatus('IN_PROGRESS');
          break;

        case 'resolve':
          if (current.assigned_to !== user.id && !isManager) {
            throw new Error('Only the assigned staff member or a manager can resolve this ticket');
          }
          if (!comment?.trim()) throw new Error('Please describe how the issue was resolved');
          await setStatus('RESOLVED');
          await addComment('Resolution: ' + comment.trim());
          break;

        case 'reopen':
          if (!isOwner) throw new Error('Only the person who raised the ticket can reopen it');
          if (!comment?.trim()) throw new Error('Please say why the issue is not resolved');
          await setStatus('REOPENED');
          await addComment('Reopened: ' + comment.trim());
          break;

        case 'close': // citizen confirms the fix and rates it
          if (!isOwner) throw new Error('Only the person who raised the ticket can close it');
          await setStatus('CLOSED', ', rating = $4', [rating || null]);
          break;

        case 'withdraw':
          if (!isOwner) throw new Error('Only the person who raised the ticket can withdraw it');
          await setStatus('CLOSED');
          break;

        default:
          throw new Error('Unknown action');
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // our own permission errors (plain JS errors have no SQLSTATE code)
    if (!err.code) return jsonError(err.message, 403);
    return dbError(err);
  }
}
