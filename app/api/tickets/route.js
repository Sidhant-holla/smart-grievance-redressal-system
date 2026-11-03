import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireRole, jsonError, dbError } from '@/lib/api';
import { getEmbedding, ticketText, toPgVector } from '@/lib/embeddings';
import { runEscalationCheck } from '@/lib/escalation';

// similarity >= this is stored as "possible duplicate" on the new ticket.
// Picked after testing on our seed data: re-worded duplicates scored
// 0.61 - 0.71 ("lift not working" vs "elevator stuck" = 0.611), while
// related-but-different complaints mostly scored 0.43 - 0.56. We first used
// 0.65 but that missed the lift/elevator pair, so it was lowered to 0.60.
// A false "possible duplicate" note is cheap, a missed duplicate is not.
const DUPLICATE_THRESHOLD = 0.6;

// ---------------------------------------------------------------------
// GET /api/tickets  - list tickets the current user is allowed to see
//   ?scope=mine|unassigned|department   (staff / head)
//   ?status=OPEN ...   ?deptId=3 (admin)
//   ?q=search text  &mode=keyword|semantic
// ---------------------------------------------------------------------
export async function GET(request) {
  const { user, error } = await requireRole();
  if (error) return error;

  await runEscalationCheck();

  const params = new URL(request.url).searchParams;
  const scope = params.get('scope') || 'department';
  const status = params.get('status');
  const deptId = params.get('deptId');
  const q = (params.get('q') || '').trim();
  const mode = params.get('mode') || 'keyword';

  const conditions = [];
  const values = [];
  // adds a value to the parameter list and returns its placeholder ($1, $2 ...)
  const param = (value) => {
    values.push(value);
    return '$' + values.length;
  };

  // 1. which tickets this role can see
  if (user.role === 'citizen') {
    const me = param(user.id);
    conditions.push(`(v.created_by = ${me} OR v.ticket_id IN
                      (SELECT ticket_id FROM ticket_supporters WHERE user_id = ${me}))`);
  } else if (user.role === 'staff' || user.role === 'dept_head') {
    conditions.push(`v.dept_id = ${param(user.deptId)}`);
    if (scope === 'mine') conditions.push(`v.assigned_to = ${param(user.id)}`);
    if (scope === 'unassigned') conditions.push(`v.status = 'OPEN' AND v.assigned_to IS NULL`);
  } else if (user.role === 'admin' && deptId) {
    conditions.push(`v.dept_id = ${param(Number(deptId))}`);
  }

  // 2. filters
  if (status === 'ACTIVE') conditions.push('v.is_open');
  else if (status) conditions.push(`v.status = ${param(status)}`);

  let sql;
  if (q && mode === 'semantic') {
    // semantic search: compare the meaning of the search text with every ticket
    const embedding = toPgVector(await getEmbedding(q));
    const vec = param(embedding);
    conditions.push(`1 - (e.embedding <=> ${vec}) >= 0.3`);
    sql = `SELECT v.*, ROUND((1 - (e.embedding <=> ${vec}))::numeric, 3) AS similarity
             FROM v_ticket_details v
             JOIN ticket_embeddings e ON e.ticket_id = v.ticket_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY e.embedding <=> ${vec}
            LIMIT 25`;
  } else if (q) {
    // keyword search: PostgreSQL full-text search on the generated tsvector column
    const tsq = `plainto_tsquery('english', ${param(q)})`;
    conditions.push(`t.search_vector @@ ${tsq}`);
    sql = `SELECT v.*, ROUND(ts_rank(t.search_vector, ${tsq})::numeric, 3) AS rank
             FROM v_ticket_details v
             JOIN tickets t ON t.ticket_id = v.ticket_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY rank DESC
            LIMIT 50`;
  } else {
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    sql = `SELECT v.* FROM v_ticket_details v ${where}
            ORDER BY v.is_open DESC, v.is_overdue DESC, v.created_at DESC
            LIMIT 200`;
  }

  const result = await query(sql, values);
  return NextResponse.json({ tickets: result.rows });
}

// ---------------------------------------------------------------------
// POST /api/tickets  - citizen submits a new complaint
// ---------------------------------------------------------------------
export async function POST(request) {
  const { user, error } = await requireRole('citizen');
  if (error) return error;

  const { title, description, location, priority, deptId } = await request.json();
  if (!title || !description || !deptId) return jsonError('Title, description and department are required');

  // embedding is computed before the transaction so the DB connection is not held while the model runs
  const embedding = toPgVector(await getEmbedding(ticketText(title, description)));

  try {
    const ticket = await withTransaction(async (client) => {
      // closest open ticket, if it is similar enough we link it as a possible duplicate
      const similar = await client.query('SELECT * FROM find_similar_tickets($1, $2, 1)', [
        embedding,
        DUPLICATE_THRESHOLD,
      ]);
      const duplicateOf = similar.rows[0]?.ticket_id ?? null;

      // status, due_at etc. are filled in by the ticket_before_insert trigger
      const inserted = await client.query(
        `INSERT INTO tickets (title, description, location, priority, dept_id, created_by, possible_duplicate_of)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ticket_id`,
        [title.trim(), description.trim(), location?.trim() || null, priority || 'MEDIUM', deptId, user.id, duplicateOf]
      );
      const ticketId = inserted.rows[0].ticket_id;

      await client.query('INSERT INTO ticket_embeddings (ticket_id, embedding) VALUES ($1, $2)', [ticketId, embedding]);

      // stored procedure: give it to the least busy available staff member
      await client.query('CALL auto_assign_ticket($1)', [ticketId]);

      return { ticketId, duplicateOf };
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
