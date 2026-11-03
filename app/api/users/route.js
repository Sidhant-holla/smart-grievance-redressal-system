import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '@/lib/db';
import { requireRole, jsonError, dbError } from '@/lib/api';

// GET /api/users - admin: all users with their department (if staff)
export async function GET() {
  const { error } = await requireRole('admin');
  if (error) return error;

  const result = await query(
    `SELECT u.user_id, u.full_name, u.email, u.role, u.is_active, u.created_at,
            s.designation, d.name AS dept_name,
            (SELECT COUNT(*) FROM tickets t WHERE t.created_by = u.user_id)::int AS tickets_raised
       FROM users u
       LEFT JOIN staff s       ON s.staff_id = u.user_id
       LEFT JOIN departments d ON d.dept_id  = s.dept_id
      ORDER BY u.role, u.full_name`
  );
  return NextResponse.json({ users: result.rows });
}

// POST /api/users - admin creates a staff member, department head or admin.
// For staff/heads two tables are written (users + staff), so it is one transaction:
// either both rows are created or neither is.
export async function POST(request) {
  const { error } = await requireRole('admin');
  if (error) return error;

  const { fullName, email, password, role, deptId, designation } = await request.json();
  if (!fullName || !email || !password || !role) return jsonError('All fields are required');
  if (password.length < 8) return jsonError('Password must be at least 8 characters');
  if (!['staff', 'dept_head', 'admin'].includes(role)) return jsonError('Invalid role');
  if (role !== 'admin' && !deptId) return jsonError('Staff and department heads need a department');

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const userId = await withTransaction(async (client) => {
      const inserted = await client.query(
        'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id',
        [fullName.trim(), email.trim(), passwordHash, role]
      );
      const id = inserted.rows[0].user_id;

      if (role !== 'admin') {
        await client.query('INSERT INTO staff (staff_id, dept_id, designation) VALUES ($1, $2, $3)', [
          id,
          deptId,
          designation || (role === 'dept_head' ? 'Head of Department' : 'Staff'),
        ]);
      }
      // a new head replaces the old head of that department
      if (role === 'dept_head') {
        await client.query('UPDATE departments SET head_id = $1 WHERE dept_id = $2', [id, deptId]);
      }
      return id;
    });
    return NextResponse.json({ userId }, { status: 201 });
  } catch (err) {
    if (err.code === '23505') return jsonError('An account with this email already exists', 409);
    return dbError(err);
  }
}
