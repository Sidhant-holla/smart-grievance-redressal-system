import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/api';

// GET   /api/staff/availability  - is the logged-in staff member taking new tickets?
// PATCH /api/staff/availability  - toggle it (auto-assign skips unavailable staff)
export async function GET() {
  const { user, error } = await requireRole('staff', 'dept_head');
  if (error) return error;

  const result = await query('SELECT is_available FROM staff WHERE staff_id = $1', [user.id]);
  return NextResponse.json({ isAvailable: result.rows[0]?.is_available ?? false });
}

export async function PATCH(request) {
  const { user, error } = await requireRole('staff', 'dept_head');
  if (error) return error;

  const { isAvailable } = await request.json();
  await query('UPDATE staff SET is_available = $1 WHERE staff_id = $2', [Boolean(isAvailable), user.id]);
  return NextResponse.json({ ok: true });
}
