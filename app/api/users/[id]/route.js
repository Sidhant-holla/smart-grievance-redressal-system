import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError } from '@/lib/api';

// PATCH /api/users/:id  body: { isActive }
// Users are deactivated instead of deleted, because their tickets and
// history rows still reference them (ON DELETE RESTRICT on tickets.created_by).
export async function PATCH(request, { params }) {
  const { user, error } = await requireRole('admin');
  if (error) return error;

  const userId = Number(params.id);
  if (userId === user.id) return jsonError('You cannot deactivate your own account');

  const { isActive } = await request.json();
  const result = await query('UPDATE users SET is_active = $1 WHERE user_id = $2', [Boolean(isActive), userId]);
  if (result.rowCount === 0) return jsonError('User not found', 404);
  return NextResponse.json({ ok: true });
}
