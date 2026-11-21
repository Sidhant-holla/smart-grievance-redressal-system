import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, jsonError, dbError } from '@/lib/api';

// PATCH /api/departments/:id - admin changes SLA / description / head
// (the department_head_check trigger makes sure the head belongs here)
export async function PATCH(request, { params }) {
  const { error } = await requireRole('admin');
  if (error) return error;

  // Reads the new values. An invalid SLA or head is rejected by the database and shown on the page.
  const { description, slaHours, headId } = await request.json();

  try {
    const result = await query(
      `UPDATE departments
          SET description = $1, sla_hours = $2, head_id = $3
        WHERE dept_id = $4`,
      [description || null, slaHours, headId || null, Number(params.id)]
    );
    if (result.rowCount === 0) return jsonError('Department not found', 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError(err);
  }
}
