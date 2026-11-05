import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError, dbError } from '@/lib/api';

// DELETE /api/tickets/:id/support
// "Stop following" - removes the citizen's row from ticket_supporters
export async function DELETE(request, { params }) {
  const { user, error } = await requireRole('citizen');
  if (error) return error;

  const result = await query('DELETE FROM ticket_supporters WHERE ticket_id = $1 AND user_id = $2', [
    Number(params.id),
    user.id,
  ]);
  if (result.rowCount === 0) return jsonError('You are not following this ticket', 404);
  return NextResponse.json({ ok: true });
}

// POST /api/tickets/:id/support
// "I have the same problem" - used from the duplicate warning on the
// submission form, so the citizen joins an existing ticket instead of
// creating a new one. The composite primary key (ticket_id, user_id)
// stops anyone from supporting the same ticket twice.
export async function POST(request, { params }) {
  const { user, error } = await requireRole('citizen');
  if (error) return error;

  const ticketId = Number(params.id);
  const ticket = await query(
    `SELECT t.created_by, s.is_open
       FROM tickets t JOIN ticket_statuses s ON s.status_code = t.status
      WHERE t.ticket_id = $1`,
    [ticketId]
  );
  if (ticket.rowCount === 0) return jsonError('Ticket not found', 404);
  if (ticket.rows[0].created_by === user.id) return jsonError('This is your own ticket');
  if (!ticket.rows[0].is_open) return jsonError('This ticket is already resolved or closed');

  try {
    await query('INSERT INTO ticket_supporters (ticket_id, user_id) VALUES ($1, $2)', [ticketId, user.id]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err.code === '23505') return jsonError('You are already following this ticket', 409);
    return dbError(err);
  }
}
