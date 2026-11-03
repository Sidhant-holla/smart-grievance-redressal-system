import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError } from '@/lib/api';
import { getEmbedding, ticketText, toPgVector } from '@/lib/embeddings';

// POST /api/tickets/check
// Called from the submission form BEFORE the ticket is saved.
// Returns (1) open tickets that look like the same problem and
//         (2) which department handled similar complaints in the past.
export async function POST(request) {
  const { error } = await requireRole('citizen');
  if (error) return error;

  const { title, description } = await request.json();
  if (!title || !description) return jsonError('Title and description are required');

  const embedding = toPgVector(await getEmbedding(ticketText(title, description)));

  // lower threshold than the auto-flag (0.6) - here the citizen decides,
  // so showing a few loosely related tickets is fine
  const similar = await query('SELECT * FROM find_similar_tickets($1, 0.5, 5)', [embedding]);
  const suggestions = await query('SELECT * FROM suggest_department($1, 7)', [embedding]);

  return NextResponse.json({ similar: similar.rows, suggestions: suggestions.rows });
}
