import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError, embeddingError } from '@/lib/api';
import { getEmbedding, ticketText, toPgVector } from '@/lib/embeddings';

// POST /api/tickets/check
// Called from the submission form BEFORE the ticket is saved.
// Returns (1) open tickets that look like the same problem and
//         (2) which department handled similar complaints in the past.
export async function POST(request) {
  const { user, error } = await requireRole('citizen');
  if (error) return error;

  const { title, description } = await request.json();
  if (!title || !description) return jsonError('Title and description are required');

  let embedding;
  try {
    embedding = toPgVector(await getEmbedding(ticketText(title, description)));
  } catch (err) {
    return embeddingError(err);
  }

  // lower threshold than the auto-flag (0.6) - here the citizen decides,
  // so showing a few loosely related tickets is fine
  const similar = await query('SELECT * FROM find_similar_tickets($1, 0.5, 5)', [embedding]);
  const suggestions = await query('SELECT * FROM suggest_department($1, 7)', [embedding]);

  // the citizen cannot support their own ticket or support one twice,
  // so the form needs to know which matches are already theirs
  const ids = similar.rows.map((row) => row.ticket_id);
  const relation = await query(
    `SELECT t.ticket_id,
            t.created_by = $2 AS is_mine,
            EXISTS (SELECT 1 FROM ticket_supporters s
                     WHERE s.ticket_id = t.ticket_id AND s.user_id = $2) AS is_following
       FROM tickets t
      WHERE t.ticket_id = ANY($1)`,
    [ids, user.id]
  );
  const rows = similar.rows.map((row) => ({
    ...row,
    ...relation.rows.find((r) => r.ticket_id === row.ticket_id),
  }));

  return NextResponse.json({ similar: rows, suggestions: suggestions.rows });
}
