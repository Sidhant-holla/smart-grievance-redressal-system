// PostgreSQL has no built-in timer, so something has to call
// escalate_overdue_tickets() regularly. We call it before loading ticket
// lists and dashboards, at most once a minute, so data shown is never stale.
import { query } from './db';

let lastRun = 0;

export async function runEscalationCheck(force = false) {
  const now = Date.now();
  if (!force && now - lastRun < 60 * 1000) return 0;
  lastRun = now;

  const result = await query('SELECT escalate_overdue_tickets() AS count');
  return result.rows[0].count;
}
