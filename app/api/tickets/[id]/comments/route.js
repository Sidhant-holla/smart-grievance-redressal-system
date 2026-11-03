import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError, dbError } from '@/lib/api';
import { loadTicketFor } from '@/lib/tickets';

// POST /api/tickets/:id/comments   body: { body, isInternal }
export async function POST(request, { params }) {
  const { user, error } = await requireRole();
  if (error) return error;

  const ticket = await loadTicketFor(user, Number(params.id));
  if (!ticket) return jsonError('Ticket not found', 404);
  if (ticket.status === 'CLOSED') return jsonError('This ticket is closed');

  const { body, isInternal } = await request.json();
  // citizens can never write internal notes
  const internal = user.role !== 'citizen' && Boolean(isInternal);

  try {
    await query('INSERT INTO ticket_comments (ticket_id, user_id, body, is_internal) VALUES ($1, $2, $3, $4)', [
      ticket.ticket_id,
      user.id,
      body ?? '',
      internal,
    ]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
