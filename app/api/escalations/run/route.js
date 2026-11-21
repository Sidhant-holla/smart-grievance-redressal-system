import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api';
import { runEscalationCheck } from '@/lib/escalation';

// POST /api/escalations/run - admin runs the escalation check right now
export async function POST() {
  const { error } = await requireRole('admin');
  if (error) return error;

  // true skips the once-a-minute limit, so it always runs.
  const count = await runEscalationCheck(true);
  return NextResponse.json({ escalated: count });
}
