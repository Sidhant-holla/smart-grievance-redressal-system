import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

// GET /api/auth/me - who is logged in. The navbar and ticket page use this.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });

  const unread = await query(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [user.id]
  );
  return NextResponse.json({ user, unreadNotifications: unread.rows[0].count });
}
