import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError, dbError } from '@/lib/api';
import { accountProblem, createAccount } from '@/lib/users';

// GET /api/users - admin: all users with their department (if staff)
export async function GET() {
  const { error } = await requireRole('admin');
  if (error) return error;

  // LEFT JOIN because citizens and admins have no staff row. The subquery counts tickets raised.
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

// POST /api/users - admin creates an account with any role
export async function POST(request) {
  const { error } = await requireRole('admin');
  if (error) return error;

  const { fullName, email, password, role, deptId, designation } = await request.json();

  // Same checks as the Register page.
  const problem = accountProblem({ fullName, email, password, role, deptId });
  if (problem) return jsonError(problem);

  try {
    const user = await createAccount({ fullName, email, password, role, deptId, designation });
    return NextResponse.json({ userId: user.user_id }, { status: 201 });
  } catch (err) {
    if (err.code === '23505') return jsonError('An account with this email already exists', 409);
    return dbError(err);
  }
}
