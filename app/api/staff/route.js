import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/api';

// GET /api/staff?deptId=  - staff workload (head: own department, admin: any)
export async function GET(request) {
  const { user, error } = await requireRole('dept_head', 'admin');
  if (error) return error;

  const deptId = user.role === 'dept_head' ? user.deptId : new URL(request.url).searchParams.get('deptId');

  const result = deptId
    ? await query('SELECT * FROM v_staff_workload WHERE dept_id = $1 ORDER BY role DESC, full_name', [deptId])
    : await query('SELECT * FROM v_staff_workload ORDER BY dept_name, role DESC, full_name');
  return NextResponse.json({ staff: result.rows });
}
