import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/api';

// GET /api/notifications - latest 30 notifications of the logged-in user
export async function GET() {
  const { user, error } = await requireRole();
  if (error) return error;

  // Newest first, at most 30. Only this user's rows are returned.
  const result = await query(
    `SELECT notification_id, ticket_id, message, is_read, created_at
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 30`,
    [user.id]
  );
  return NextResponse.json({ notifications: result.rows });
}

// POST /api/notifications - mark all as read
export async function POST() {
  const { user, error } = await requireRole();
  if (error) return error;

  await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [user.id]);
  return NextResponse.json({ ok: true });
}
