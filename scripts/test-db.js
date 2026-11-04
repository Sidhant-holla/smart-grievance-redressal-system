// Database tests - run after setup + seed:  npm run db:test
// Each test runs inside a transaction that is rolled back, so the seed data
// is not changed (except the concurrency tests, which clean up after themselves).

const path = require('path');
const { Client } = require('pg');

process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

// same shape as a real bcrypt hash, so tests of other rules are not stopped by chk_user_password
const FAKE_HASH = '$2a$10$' + 'a'.repeat(53);

const results = [];
let db;

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ->  ' + detail : ''}`);
}

// runs fn inside BEGIN ... ROLLBACK
async function inRollback(fn) {
  await db.query('BEGIN');
  try {
    return await fn();
  } finally {
    await db.query('ROLLBACK');
  }
}

// test passes if the SQL fails with an error containing `expected`
async function expectError(name, sql, params, expected) {
  await inRollback(async () => {
    try {
      await db.query(sql, params);
      record(name, false, 'statement was accepted but should have failed');
    } catch (err) {
      const text = err.constraint || err.message;
      record(name, text.includes(expected), text);
    }
  });
}

async function newTicket(client, deptId, createdBy, extra = '') {
  const r = await client.query(
    `INSERT INTO tickets (title, description, dept_id, created_by ${extra ? ', priority' : ''})
     VALUES ('Test ticket title', 'Test ticket description for automated tests', $1, $2 ${extra ? ", '" + extra + "'" : ''})
     RETURNING *`,
    [deptId, createdBy]
  );
  return r.rows[0];
}

let extractor;
async function embed(text) {
  if (!extractor) {
    const { pipeline } = await import('@xenova/transformers');
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return '[' + Array.from(output.data).join(',') + ']';
}

async function main() {
  db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // ids used by the tests
  const id = async (sql) => (await db.query(sql)).rows[0].id;
  const itDept = await id(`SELECT dept_id AS id FROM departments WHERE name = 'IT Services'`);
  const hostelDept = await id(`SELECT dept_id AS id FROM departments WHERE name = 'Hostel & Accommodation'`);
  const transportDept = await id(`SELECT dept_id AS id FROM departments WHERE name = 'Transport'`);
  const citizen = await id(`SELECT user_id AS id FROM users WHERE email = 'ananya@student.campus.edu'`);
  const itStaff = await id(`SELECT user_id AS id FROM users WHERE email = 'ravi.it@campus.edu'`);
  const itHead = await id(`SELECT user_id AS id FROM users WHERE email = 'head.it@campus.edu'`);
  const hostelStaff = await id(`SELECT user_id AS id FROM users WHERE email = 'manoj.hostel@campus.edu'`);
  const transportStaff = await id(`SELECT user_id AS id FROM users WHERE email = 'kiran.transport@campus.edu'`);
  const transportHead = await id(`SELECT user_id AS id FROM users WHERE email = 'head.transport@campus.edu'`);

  console.log('\n--- Constraints (data validation at database level) ---');
  await expectError('Invalid email format is rejected',
    `INSERT INTO users (full_name, email, password_hash) VALUES ('Test User', 'not-an-email', 'x')`, [], 'chk_user_email');
  await expectError('Same email with different case is rejected',
    `INSERT INTO users (full_name, email, password_hash) VALUES ('Test User', 'ANANYA@student.campus.edu', $1)`, [FAKE_HASH], 'idx_users_email_lower');
  await expectError('Plain text password is rejected',
    `INSERT INTO users (full_name, email, password_hash) VALUES ('Test User', 'plain@campus.edu', 'Password@123')`, [], 'chk_user_password');
  await expectError('Unknown role is rejected',
    `INSERT INTO users (full_name, email, password_hash, role) VALUES ('Test', 't@x.com', $1, 'superuser')`, [FAKE_HASH], 'chk_user_role');
  await expectError('Too short description is rejected',
    `INSERT INTO tickets (title, description, dept_id, created_by) VALUES ('Broken fan', 'fan broken', $1, $2)`, [itDept, citizen], 'chk_ticket_description');
  await expectError('Invalid priority is rejected',
    `INSERT INTO tickets (title, description, dept_id, created_by, priority) VALUES ('Some title', 'a long enough description here', $1, $2, 'URGENT')`,
    [itDept, citizen], 'chk_ticket_priority');
  await expectError('SLA outside 1-720 hours is rejected',
    `UPDATE departments SET sla_hours = 0 WHERE dept_id = $1`, [itDept], 'chk_sla_hours');
  await expectError('Rating on a ticket that is not closed is rejected',
    `UPDATE tickets SET rating = 6 WHERE ticket_id = (SELECT ticket_id FROM tickets WHERE status = 'RESOLVED' LIMIT 1)`, [], 'chk_rating');
  await expectError('Ticket for a non-existent department is rejected (FK)',
    `INSERT INTO tickets (title, description, dept_id, created_by) VALUES ('Some title', 'a long enough description here', 9999, $1)`,
    [citizen], 'tickets_dept_id_fkey');
  await expectError('Same citizen cannot support a ticket twice (composite PK)',
    `INSERT INTO ticket_supporters (ticket_id, user_id) SELECT ticket_id, user_id FROM ticket_supporters LIMIT 1`, [], 'ticket_supporters_pkey');

  console.log('\n--- Triggers (workflow enforcement) ---');
  await expectError('New ticket cannot start as RESOLVED',
    `INSERT INTO tickets (title, description, dept_id, created_by, status) VALUES ('Some title', 'a long enough description here', $1, $2, 'RESOLVED')`,
    [itDept, citizen], 'must start with status OPEN');

  await inRollback(async () => {
    const t = await newTicket(db, itDept, citizen);
    try {
      await db.query(`UPDATE tickets SET status = 'RESOLVED' WHERE ticket_id = $1`, [t.ticket_id]);
      record('OPEN -> RESOLVED directly is rejected', false, 'accepted');
    } catch (err) {
      record('OPEN -> RESOLVED directly is rejected', err.message.includes('Invalid status change'), err.message);
    }
  });

  await inRollback(async () => {
    const t = await newTicket(db, itDept, citizen);
    try {
      await db.query('CALL assign_ticket($1, $2, $3)', [t.ticket_id, hostelStaff, itHead]);
      record('Assigning to staff of another department is rejected', false, 'accepted');
    } catch (err) {
      record('Assigning to staff of another department is rejected', err.message.includes('does not belong'), err.message);
    }
  });

  await expectError('Closed ticket cannot be modified',
    `UPDATE tickets SET title = 'changed title' WHERE ticket_id = (SELECT ticket_id FROM tickets WHERE status = 'CLOSED' LIMIT 1)`,
    [], 'is closed and cannot be changed');

  await expectError('Citizen cannot be added to the staff table',
    `INSERT INTO staff (staff_id, dept_id) VALUES ($1, $2)`, [citizen, itDept], 'must have role staff or dept_head');

  await inRollback(async () => {
    const normal = await newTicket(db, itDept, citizen);
    const high = await newTicket(db, itDept, citizen, 'HIGH');
    const hours = (t) => Math.round((t.due_at - t.created_at) / 3600000);
    record('due_at = created_at + SLA (24h), HIGH priority gets half (12h)',
      hours(normal) === 24 && hours(high) === 12, `MEDIUM: ${hours(normal)}h, HIGH: ${hours(high)}h`);
  });

  await inRollback(async () => {
    const t = await newTicket(db, itDept, citizen);
    await db.query('CALL assign_ticket($1, $2, $3)', [t.ticket_id, itStaff, itHead]);
    await db.query(`UPDATE tickets SET status = 'IN_PROGRESS', updated_by = $2 WHERE ticket_id = $1`, [t.ticket_id, itStaff]);
    const h = await db.query('SELECT old_status, new_status, changed_by FROM ticket_status_history WHERE ticket_id = $1 ORDER BY history_id', [t.ticket_id]);
    const steps = h.rows.map((r) => `${r.old_status || 'NULL'}->${r.new_status}`).join(', ');
    record('Every status change is written to history by trigger',
      h.rowCount === 3 && h.rows[2].changed_by === itStaff, steps);
  });

  await inRollback(async () => {
    const t = await newTicket(db, itDept, citizen);
    await db.query('CALL assign_ticket($1, $2, $3)', [t.ticket_id, itStaff, itHead]);
    await db.query(`UPDATE tickets SET due_at = now() - interval '1 hour' WHERE ticket_id = $1`, [t.ticket_id]);
    await db.query('SELECT escalate_overdue_tickets()');
    const after = (await db.query('SELECT status, escalation_count FROM tickets WHERE ticket_id = $1', [t.ticket_id])).rows[0];
    const notif = await db.query('SELECT 1 FROM notifications WHERE ticket_id = $1 AND user_id = $2', [t.ticket_id, itHead]);
    record('Overdue ticket is escalated and the head is notified',
      after.status === 'ESCALATED' && after.escalation_count === 1 && notif.rowCount === 1,
      `status=${after.status}, escalation_count=${after.escalation_count}, head notified=${notif.rowCount === 1}`);

    // rule 3: re-assigning an escalated ticket starts a fresh SLA window
    await db.query('CALL assign_ticket($1, $2, $3)', [t.ticket_id, itStaff, itHead]);
    const re = (await db.query(`SELECT status, due_at > now() AS fresh FROM tickets WHERE ticket_id = $1`, [t.ticket_id])).rows[0];
    record('Re-assigning an escalated ticket gives a new deadline', re.status === 'ASSIGNED' && re.fresh, `status=${re.status}, new due in future=${re.fresh}`);
  });

  await inRollback(async () => {
    const t = await newTicket(db, itDept, citizen);
    await db.query('CALL assign_ticket($1, $2, $3)', [t.ticket_id, itStaff, itHead]);
    await db.query(`UPDATE tickets SET status = 'RESOLVED', updated_by = $2 WHERE ticket_id = $1`, [t.ticket_id, itStaff]);
    await db.query(`UPDATE tickets SET due_at = now() - interval '5 hours' WHERE ticket_id = $1`, [t.ticket_id]);
    await db.query(`UPDATE tickets SET status = 'REOPENED', updated_by = $2 WHERE ticket_id = $1`, [t.ticket_id, citizen]);
    const r = (await db.query('SELECT resolved_at, due_at > now() AS fresh FROM tickets WHERE ticket_id = $1', [t.ticket_id])).rows[0];
    record('Reopening clears resolved_at and resets the SLA timer', r.resolved_at === null && r.fresh,
      `resolved_at=${r.resolved_at}, new due in future=${r.fresh}`);
  });

  await inRollback(async () => {
    const t = await newTicket(db, itDept, citizen);
    const follower = await id(`SELECT user_id AS id FROM users WHERE email = 'rahul@student.campus.edu'`);
    await db.query('INSERT INTO ticket_supporters (ticket_id, user_id) VALUES ($1, $2)', [t.ticket_id, follower]);
    await db.query('CALL assign_ticket($1, $2, $3)', [t.ticket_id, itStaff, itHead]);
    const n = await db.query('SELECT message FROM notifications WHERE ticket_id = $1 AND user_id = $2', [t.ticket_id, follower]);
    record('Citizens following a ticket are notified of status changes', n.rowCount === 1, n.rows[0]?.message);
  });

  await inRollback(async () => {
    const t = await newTicket(db, itDept, citizen);
    await db.query('CALL assign_ticket($1, $2, $3)', [t.ticket_id, itStaff, itHead]);
    await db.query(`UPDATE tickets SET status = 'CLOSED', updated_by = $2 WHERE ticket_id = $1`, [t.ticket_id, citizen]);
    const r = await db.query('SELECT status FROM tickets WHERE ticket_id = $1', [t.ticket_id]);
    record('Citizen can withdraw a ticket that is assigned but not started', r.rows[0].status === 'CLOSED', `status=${r.rows[0].status}`);
  });

  await inRollback(async () => {
    const t = await newTicket(db, itDept, citizen);
    await db.query('CALL assign_ticket($1, $2, $3)', [t.ticket_id, itStaff, itHead]);
    await db.query(`UPDATE tickets SET status = 'IN_PROGRESS', updated_by = $2 WHERE ticket_id = $1`, [t.ticket_id, itStaff]);
    try {
      await db.query(`UPDATE tickets SET status = 'CLOSED' WHERE ticket_id = $1`, [t.ticket_id]);
      record('Ticket in progress cannot be withdrawn', false, 'accepted');
    } catch (err) {
      record('Ticket in progress cannot be withdrawn', err.message.includes('Invalid status change'), err.message);
    }
  });

  console.log('\n--- Stored procedures ---');
  await inRollback(async () => {
    const t = await newTicket(db, itDept, citizen);
    await db.query('CALL auto_assign_ticket($1)', [t.ticket_id]);
    const r = (await db.query(
      `SELECT t.status, t.assigned_to,
              (SELECT staff_id FROM v_staff_workload WHERE dept_id = $2 AND role = 'staff' AND is_available
                ORDER BY active_tickets, staff_id LIMIT 1) AS expected
         FROM tickets t WHERE ticket_id = $1`, [t.ticket_id, itDept])).rows[0];
    record('auto_assign_ticket picks the least loaded available staff', r.status === 'ASSIGNED',
      `assigned_to=${r.assigned_to}, status=${r.status}`);
  });

  await inRollback(async () => {
    const t = await newTicket(db, transportDept, citizen);
    await db.query('CALL auto_assign_ticket($1)', [t.ticket_id]);
    const r = (await db.query('SELECT status FROM tickets WHERE ticket_id = $1', [t.ticket_id])).rows[0];
    record('No available staff -> ticket stays OPEN in the queue', r.status === 'OPEN', `status=${r.status}`);
  });

  console.log('\n--- Concurrency: two staff pick up the same ticket at the same time ---');
  const c1 = new Client({ connectionString: process.env.DATABASE_URL });
  const c2 = new Client({ connectionString: process.env.DATABASE_URL });
  await c1.connect();
  await c2.connect();
  const created = [];
  try {
    // (a) without locking: read, then update - the second write silently wins
    const naive = await newTicket(db, transportDept, citizen);
    created.push(naive.ticket_id);
    await c1.query('BEGIN');
    await c2.query('BEGIN');
    const read1 = await c1.query('SELECT status FROM tickets WHERE ticket_id = $1', [naive.ticket_id]);
    const read2 = await c2.query('SELECT status FROM tickets WHERE ticket_id = $1', [naive.ticket_id]);
    // both see OPEN, both think they got it
    await c1.query(`UPDATE tickets SET status = 'ASSIGNED', assigned_to = $2, updated_by = $2 WHERE ticket_id = $1`, [naive.ticket_id, transportStaff]);
    await c1.query('COMMIT');
    await c2.query(`UPDATE tickets SET status = 'ASSIGNED', assigned_to = $2, updated_by = $2 WHERE ticket_id = $1`, [naive.ticket_id, transportHead]);
    await c2.query('COMMIT');
    const final = (await db.query('SELECT assigned_to FROM tickets WHERE ticket_id = $1', [naive.ticket_id])).rows[0];
    record('WITHOUT row lock: both staff "succeed" (lost update - shows the problem)',
      read1.rows[0].status === 'OPEN' && read2.rows[0].status === 'OPEN' && final.assigned_to === transportHead,
      `both read OPEN, first staff's assignment was overwritten by the second`);

    // (b) with claim_ticket (SELECT ... FOR UPDATE): second one waits, then fails
    const safe = await newTicket(db, transportDept, citizen);
    created.push(safe.ticket_id);
    await c1.query('BEGIN');
    await c2.query('BEGIN');
    await c1.query('CALL claim_ticket($1, $2)', [safe.ticket_id, transportStaff]);   // c1 now holds the row lock
    const second = c2.query('CALL claim_ticket($1, $2)', [safe.ticket_id, transportHead]); // blocks
    await new Promise((resolve) => setTimeout(resolve, 300));
    await c1.query('COMMIT');                                                         // releases the lock
    let secondError = null;
    try {
      await second;
      await c2.query('COMMIT');
    } catch (err) {
      secondError = err.message;
      await c2.query('ROLLBACK');
    }
    const owner = (await db.query('SELECT assigned_to FROM tickets WHERE ticket_id = $1', [safe.ticket_id])).rows[0];
    record('WITH claim_ticket (FOR UPDATE): first wins, second gets a clear error',
      owner.assigned_to === transportStaff && secondError && secondError.includes('already picked up'),
      secondError);
  } finally {
    await db.query('DELETE FROM tickets WHERE ticket_id = ANY($1)', [created]);
    await c1.end();
    await c2.end();
  }

  console.log('\n--- Views / aggregate correctness ---');
  const real = await db.query('SELECT dept_id, COUNT(*)::int AS n FROM tickets GROUP BY dept_id');
  const view = await db.query('SELECT dept_id, total_tickets::int AS n FROM v_department_stats');
  const match = real.rows.every((r) => view.rows.find((v) => v.dept_id === r.dept_id).n === r.n);
  record('v_department_stats totals match COUNT(*) on tickets', match);

  const wrong = await db.query(
    `SELECT COUNT(*)::int AS joined, COUNT(DISTINCT t.ticket_id)::int AS distinct_tickets
       FROM tickets t JOIN ticket_status_history h ON h.ticket_id = t.ticket_id WHERE t.dept_id = $1`, [itDept]);
  const itTotal = view.rows.find((v) => v.dept_id === itDept).n;
  record('Naive JOIN with history over-counts (why the view avoids it)',
    wrong.rows[0].joined > itTotal && wrong.rows[0].distinct_tickets === itTotal,
    `JOIN gives ${wrong.rows[0].joined} rows, real ticket count is ${itTotal}`);

  console.log('\n--- Vector similarity (pgvector) ---');
  const dupText = 'Hostel wifi keeps disconnecting. Since last night the internet in my hostel room disconnects every few minutes and I cannot attend online class.';
  const sim = await db.query('SELECT ticket_id, title, round(similarity::numeric, 3) AS s FROM find_similar_tickets($1, 0.5, 3)', [await embed(dupText)]);
  const top = sim.rows[0];
  record('Re-worded hostel internet complaint finds the existing open ticket',
    top && /internet/i.test(top.title), top ? `#${top.ticket_id} "${top.title}" similarity ${top.s}` : 'no match');

  const unrelated = await db.query('SELECT * FROM find_similar_tickets($1, 0.6, 3)', [await embed('Library books are not returned on time by students. Need a fine system.')]);
  record('Unrelated complaint does not match anything above 0.6', unrelated.rowCount === 0, `${unrelated.rowCount} matches`);

  const cases = [
    ['Wifi router not working in the lab. The wireless network in the electronics lab is down since morning.', 'IT Services'],
    ['Food in the hostel mess is cold and tasteless. Every day the lunch served is cold and has no taste.', 'Canteen & Mess'],
    ['My marks are missing in the results. The result sheet does not show my grade for one subject.', 'Academics & Examinations'],
    ['Ceiling fan making noise in classroom. The fan in room 112 makes a loud noise and wobbles.', 'Campus Maintenance'],
  ];
  for (const [text, expected] of cases) {
    const r = await db.query('SELECT dept_name, score FROM suggest_department($1, 7)', [await embed(text)]);
    record(`suggest_department -> ${expected}`, r.rows[0]?.dept_name === expected,
      `got "${r.rows[0]?.dept_name}" (score ${r.rows[0]?.score})`);
  }

  console.log('\n--- Full-text search vs semantic search ---');
  const kw = await db.query(`SELECT COUNT(*)::int AS n FROM tickets WHERE search_vector @@ plainto_tsquery('english', 'internet problem hostel')`);
  const sem = await db.query('SELECT COUNT(*)::int AS n FROM find_similar_tickets($1, 0.45, 10)', [await embed('internet problem hostel')]);
  record('Keyword search needs exact words, semantic search finds related wording',
    sem.rows[0].n > kw.rows[0].n, `keyword: ${kw.rows[0].n} results, semantic: ${sem.rows[0].n} open results`);

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed} / ${results.length} tests passed`);
  await db.end();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
