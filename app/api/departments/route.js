import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError, dbError } from '@/lib/api';

// GET /api/departments - list for dropdowns and the admin page
export async function GET() {
  const { error } = await requireRole();
  if (error) return error;

  // LEFT JOIN so a department with no head still appears. The subquery counts its staff.
  const result = await query(
    `SELECT d.dept_id, d.name, d.description, d.sla_hours, d.head_id, u.full_name AS head_name,
            (SELECT COUNT(*) FROM staff s WHERE s.dept_id = d.dept_id)::int AS staff_count
       FROM departments d
       LEFT JOIN users u ON u.user_id = d.head_id
      ORDER BY d.name`
  );
  return NextResponse.json({ departments: result.rows });
}

// POST /api/departments - admin creates a department
export async function POST(request) {
  const { error } = await requireRole('admin');
  if (error) return error;

  const { name, description, slaHours } = await request.json();
  if (!name?.trim()) return jsonError('Department name is required');

  try {
    const result = await query(
      'INSERT INTO departments (name, description, sla_hours) VALUES ($1, $2, $3) RETURNING dept_id',
      [name.trim(), description || null, slaHours || 72]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
