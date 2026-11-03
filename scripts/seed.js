// Fills the database with sample departments, users and tickets.
// Usage:  npm run db:setup  (creates tables)  then  npm run db:seed
//
// Tickets are NOT inserted with their final status directly - the triggers
// would not allow that anyway. Each ticket is inserted as OPEN and then moved
// through the real workflow (assign_ticket procedure, status updates), so the
// history, notifications and SLA fields are produced by the database itself.
// Afterwards the timestamps are moved into the past so the dashboards have
// realistic numbers.

const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const data = require('./seed-data');

process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const DEMO_PASSWORD = 'Password@123';
const HOUR = 3600 * 1000;

let extractor;
async function embed(text) {
  if (!extractor) {
    // transformers.js is an ES module, so it is loaded with import()
    const { pipeline } = await import('@xenova/transformers');
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return '[' + Array.from(output.data).join(',') + ']';
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  console.log('Clearing old data...');
  await db.query(`TRUNCATE notifications, ticket_comments, ticket_supporters, ticket_status_history,
                  ticket_embeddings, tickets, staff, users, departments RESTART IDENTITY CASCADE`);

  // ---------- departments ----------
  const deptIds = {};
  const deptSla = {};
  for (const d of data.departments) {
    const r = await db.query(
      'INSERT INTO departments (name, description, sla_hours) VALUES ($1, $2, $3) RETURNING dept_id',
      [d.name, d.description, d.sla]
    );
    deptIds[d.key] = r.rows[0].dept_id;
    deptSla[d.key] = d.sla;
  }

  // ---------- users ----------
  const userIds = {};
  async function addUser(email, name, role) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const r = await db.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id',
      [name, email, hash, role]
    );
    return r.rows[0].user_id;
  }

  userIds.admin = await addUser('admin@campus.edu', 'Priya Sharma', 'admin');

  const staffByDept = {}; // dept key -> list of staff user ids (role staff only)
  for (const s of data.staff) {
    const id = await addUser(`${s.key}@campus.edu`, s.name, s.role);
    userIds[s.key] = id;
    await db.query('INSERT INTO staff (staff_id, dept_id, designation) VALUES ($1, $2, $3)', [
      id,
      deptIds[s.dept],
      s.designation,
    ]);
    if (s.role === 'dept_head') {
      await db.query('UPDATE departments SET head_id = $1 WHERE dept_id = $2', [id, deptIds[s.dept]]);
    } else {
      (staffByDept[s.dept] ||= []).push(id);
    }
  }

  for (const c of data.citizens) {
    userIds[c.key] = await addUser(`${c.key}@student.campus.edu`, c.name, 'citizen');
  }
  console.log(`Created ${Object.keys(userIds).length} users`);

  // ---------- tickets ----------
  // oldest first, so the duplicate check only sees tickets that existed at that time
  const tickets = [...data.tickets].sort((a, b) => b.ago - a.ago);
  const roundRobin = {};
  const now = Date.now();

  for (const t of tickets) {
    const createdAt = new Date(now - t.ago * 24 * HOUR);
    const priority = t.pri || 'MEDIUM';
    const slaHours = priority === 'HIGH' ? deptSla[t.d] / 2 : deptSla[t.d];
    const headId = userIds['head.' + t.d];
    const creator = userIds[t.by];

    // pick staff in turn so the workload is spread out
    const deptStaff = staffByDept[t.d];
    roundRobin[t.d] = (roundRobin[t.d] || 0) + 1;
    const staffId = deptStaff[roundRobin[t.d] % deptStaff.length];
    const otherStaffId = deptStaff[(roundRobin[t.d] + 1) % deptStaff.length];

    const embedding = await embed(`${t.title}. ${t.desc}`);

    await db.query('BEGIN');

    const similar = await db.query('SELECT ticket_id FROM find_similar_tickets($1, 0.6, 1)', [embedding]);
    const inserted = await db.query(
      `INSERT INTO tickets (title, description, location, priority, dept_id, created_by, created_at, possible_duplicate_of)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ticket_id`,
      [t.title, t.desc, t.loc || null, priority, deptIds[t.d], creator, createdAt, similar.rows[0]?.ticket_id ?? null]
    );
    const id = inserted.rows[0].ticket_id;
    await db.query('INSERT INTO ticket_embeddings (ticket_id, embedding) VALUES ($1, $2)', [id, embedding]);

    // runs one workflow step, then moves the history row it created back to `at`
    async function step(sql, params, at) {
      await db.query(sql, params);
      await db.query(
        `UPDATE ticket_status_history SET changed_at = $1
          WHERE history_id = (SELECT MAX(history_id) FROM ticket_status_history WHERE ticket_id = $2)`,
        [at, id]
      );
    }
    const setStatus = (status, by, at) =>
      step('UPDATE tickets SET status = $1, updated_by = $2 WHERE ticket_id = $3', [status, by, id], at);
    const comment = (userId, body, at) =>
      db.query('INSERT INTO ticket_comments (ticket_id, user_id, body, created_at) VALUES ($1, $2, $3, $4)', [
        id,
        userId,
        body,
        at,
      ]);

    if (t.out !== 'open') {
      const resolvedAt = t.hrs ? new Date(createdAt.getTime() + t.hrs * HOUR) : null;
      const assignAt = new Date(createdAt.getTime() + Math.min(2, (t.hrs || 4) / 4) * HOUR);
      await step('CALL assign_ticket($1, $2, $3)', [id, staffId, headId], assignAt);

      // took longer than the SLA -> it was escalated and re-assigned on the way
      let lastStaff = staffId;
      if (resolvedAt && t.hrs > slaHours) {
        const escAt = new Date(createdAt.getTime() + slaHours * HOUR);
        await setStatus('ESCALATED', null, escAt);
        const reassignAt = new Date(escAt.getTime() + Math.min(2, (t.hrs - slaHours) / 2) * HOUR);
        await step('CALL assign_ticket($1, $2, $3)', [id, otherStaffId, headId], reassignAt);
        lastStaff = otherStaffId;
      }

      if (t.out !== 'assigned') {
        const startAt = new Date(assignAt.getTime() + HOUR);
        await setStatus('IN_PROGRESS', lastStaff, resolvedAt && startAt > resolvedAt ? assignAt : startAt);
      }

      if (resolvedAt) {
        await step(
          'UPDATE tickets SET status = $1, updated_by = $2, resolved_at = $3 WHERE ticket_id = $4',
          ['RESOLVED', lastStaff, resolvedAt, id],
          resolvedAt
        );
        await comment(lastStaff, 'Resolution: Issue checked and fixed. Please confirm if it is working now.', resolvedAt);
        // keep the original deadline so "resolved within SLA" is calculated correctly
        await db.query('UPDATE tickets SET due_at = compute_due_at(dept_id, priority, created_at) WHERE ticket_id = $1', [id]);

        const followUpAt = new Date(Math.min(resolvedAt.getTime() + 12 * HOUR, now - HOUR));
        if (t.out === 'closed') {
          await step('UPDATE tickets SET status = $1, updated_by = $2, rating = $3 WHERE ticket_id = $4',
            ['CLOSED', creator, t.rating, id], followUpAt);
        } else if (t.out === 'reopened') {
          await setStatus('REOPENED', creator, followUpAt);
          await comment(creator, 'Reopened: The late fee is still showing on my fee statement.', followUpAt);
        }
      }
    }

    await db.query('COMMIT');
  }
  console.log(`Created ${tickets.length} tickets`);

  // ---------- supporters ----------
  for (const [title, people] of data.supporters) {
    const r = await db.query('SELECT ticket_id, created_at FROM tickets WHERE title = $1', [title]);
    for (const [i, key] of people.entries()) {
      await db.query('INSERT INTO ticket_supporters (ticket_id, user_id, supported_at) VALUES ($1, $2, $3)', [
        r.rows[0].ticket_id,
        userIds[key],
        new Date(r.rows[0].created_at.getTime() + (i + 1) * HOUR),
      ]);
    }
  }

  // the transport coordinator is on leave -> new transport tickets stay in the OPEN queue
  await db.query('UPDATE staff SET is_available = FALSE WHERE staff_id = $1', [userIds['kiran.transport']]);

  // notifications from the seeding steps are not useful, start clean and
  // let the escalation check create the current ones
  await db.query('DELETE FROM notifications');
  const esc = await db.query('SELECT escalate_overdue_tickets() AS count');
  console.log(`Escalated ${esc.rows[0].count} overdue tickets`);

  console.log(`\nDone. All demo accounts use the password: ${DEMO_PASSWORD}`);
  await db.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
