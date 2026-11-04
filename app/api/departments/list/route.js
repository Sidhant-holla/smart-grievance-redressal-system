import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/departments/list - only id and name, public because the Register
// page needs the dropdown before the person has logged in
export async function GET() {
  const result = await query('SELECT dept_id, name FROM departments ORDER BY name');
  return NextResponse.json({ departments: result.rows });
}
