// API and security tests. They call the running app the same way the browser
// does, then write the results to docs/TEST_RESULTS_API.md.
//
// Usage (the app must be running, with seed data loaded):
//   npm run db:seed
//   npm run dev            (in one terminal)
//   npm run test:api       (in another)
//
// Everything the tests create is deleted at the end, so the seed data stays as it was.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const PASSWORD = 'Password@123';
const STUDENT_EMAIL = 'api.test.student@student.campus.edu';

const results = [];
let area = '';

function section(name) {
  area = name;
  console.log(`\n--- ${name} ---`);
}

function record(name, expected, passed, detail = '') {
  results.push({ id: `A${String(results.length + 1).padStart(2, '0')}`, area, name, expected, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ->  ' + detail : ''}`);
}

// sends a request and returns { status, body, location }
async function call(method, url, { cookie, body } = {}) {
  const res = await fetch(BASE + url, {
    method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    // pages return HTML, that is fine
  }
  return {
    status: res.status,
    body: json,
    location: (res.headers.get('location') || '').replace(BASE, ''),
    cookie: (res.headers.get('set-cookie') || '').split(';')[0],
  };
}

async function login(email) {
  const res = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  if (!res.cookie) throw new Error(`Could not log in as ${email}. Run npm run db:seed first.`);
  return res.cookie;
}

const action = (cookie, id, body) => call('POST', `/api/tickets/${id}/action`, { cookie, body });

function writeResults() {
  const passed = results.filter((r) => r.passed).length;
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    '# API and security test results',
    '',
    `Run on ${when} UTC with \`npm run test:api\` against the running app.`,
    '',
    `**${passed} of ${results.length} passed.**`,
    '',
    '| ID | Area | Test case | Expected | Result | Detail |',
    '|---|---|---|---|---|---|',
    ...results.map((r) =>
      `| ${r.id} | ${r.area} | ${r.name} | ${r.expected} | ${r.passed ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '\\|')} |`),
    '',
  ];
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'TEST_RESULTS_API.md'), lines.join('\n'));
  console.log(`\n${passed} / ${results.length} tests passed`);
  return passed === results.length;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const emails = [STUDENT_EMAIL, 'api.test.admin@campus.edu', 'api.test.staff@campus.edu'];

  // left over from a run that was stopped half way
  const cleanup = async () => {
    await db.query('DELETE FROM tickets WHERE created_by IN (SELECT user_id FROM users WHERE email = ANY($1))', [emails]);
    await db.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  };
  await cleanup();

  try {
    const ravi = await login('ravi.it@campus.edu');
    const head = await login('head.it@campus.edu');
    const admin = await login('admin@campus.edu');
    const kiran = await login('kiran.transport@campus.edu');
    const transportHead = await login('head.transport@campus.edu');
    const dept = async (name) => (await db.query('SELECT dept_id FROM departments WHERE name = $1', [name])).rows[0].dept_id;
    const itDept = await dept('IT Services');
    const transportDept = await dept('Transport');

    section('Authentication');
    let r = await call('POST', '/api/auth/register', { body: { fullName: 'Short Pw', email: 'x@campus.edu', password: '123' } });
    record('Register with a 3 character password', 'Rejected', r.status === 400, r.body.error);

    r = await call('POST', '/api/auth/register', { body: { fullName: 'Api Student', email: STUDENT_EMAIL, password: PASSWORD } });
    const student = r.cookie;
    record('Register a new citizen', '201 and logged in', r.status === 201 && Boolean(student), `status ${r.status}`);

    r = await call('POST', '/api/auth/register', { body: { fullName: 'Api Student', email: STUDENT_EMAIL.toUpperCase(), password: PASSWORD } });
    record('Register the same email again in capitals', 'Rejected', r.status === 409, r.body.error);

    r = await call('POST', '/api/auth/login', { body: { email: 'admin@campus.edu', password: 'wrong-password' } });
    record('Login with a wrong password', 'Generic error', r.status === 401, r.body.error);

    section('Account creation');
    const code = process.env.STAFF_SIGNUP_CODE;
    const signup = { fullName: 'Api Admin', email: 'api.test.admin@campus.edu', password: PASSWORD, role: 'admin' };
    r = await call('POST', '/api/auth/register', { body: signup });
    record('Register as admin with no access code', 'Rejected', r.status === 403, r.body.error);
    r = await call('POST', '/api/auth/register', { body: { ...signup, signupCode: 'wrong-code' } });
    record('Register as admin with a wrong access code', 'Rejected', r.status === 403, r.body.error);
    r = await call('POST', '/api/auth/register', { body: { ...signup, role: 'superuser', signupCode: code } });
    record('Register with a made-up role', 'Rejected', r.status === 400, r.body.error);
    if (code) {
      r = await call('POST', '/api/auth/register', { body: { ...signup, signupCode: code } });
      record('Register as admin with the correct access code', '201, goes to /admin', r.status === 201 && r.body.redirect === '/admin', r.body.redirect);
    }
    r = await call('POST', '/api/users', { cookie: admin, body: { fullName: 'Api Staff', email: 'api.test.staff@campus.edu', password: PASSWORD, role: 'staff', deptId: itDept } });
    const created = await call('POST', '/api/auth/login', { body: { email: 'api.test.staff@campus.edu', password: PASSWORD } });
    record('Admin creates a staff account and it can log in', '201 then login works', r.status === 201 && created.status === 200, `redirect ${created.body.redirect}`);
    await db.query('DELETE FROM users WHERE email = $1', ['api.test.staff@campus.edu']);

    section('Complaint submission');
    const complaint = {
      title: 'Api test wifi problem in hostel',
      description: 'The internet in my hostel room keeps disconnecting every few minutes in the evening.',
    };
    r = await call('POST', '/api/tickets/check', { cookie: student, body: complaint });
    record('Check finds similar open complaints', 'At least one match', r.status === 200 && r.body.similar.length > 0, `${r.body.similar?.length} matches, top ${r.body.similar?.[0]?.similarity?.toFixed(2)}`);
    record('Check suggests IT Services', 'IT Services on top', r.body.suggestions?.[0]?.dept_name === 'IT Services', r.body.suggestions?.[0]?.dept_name);

    r = await call('POST', '/api/tickets', { cookie: student, body: { title: 'abc', description: 'long enough description for the check', deptId: itDept } });
    record('Submit with a 3 character title', 'Rejected by CHECK', r.status === 400, r.body.error);

    r = await call('POST', '/api/tickets', { cookie: student, body: { ...complaint, deptId: itDept, priority: 'MEDIUM' } });
    const ticketId = r.body.ticketId;
    record('Submit a complaint', 'Saved and flagged as possible duplicate', r.status === 201 && Boolean(r.body.duplicateOf), `ticket ${ticketId}, duplicate of ${r.body.duplicateOf}`);

    const row = (await db.query(
      `SELECT t.status, u.email FROM tickets t JOIN users u ON u.user_id = t.assigned_to WHERE t.ticket_id = $1`, [ticketId])).rows[0];
    record('Auto-assign gives it to available staff', 'ASSIGNED', row?.status === 'ASSIGNED', row?.email);

    section('Ticket lifecycle');
    const assignee = await login(row.email);
    const other = row.email.startsWith('ravi') ? await login('divya.it@campus.edu') : ravi;

    r = await action(other, ticketId, { action: 'start' });
    record('Staff who is not the assignee clicks Start', 'Rejected', r.status === 403, r.body.error);
    r = await action(assignee, ticketId, { action: 'start' });
    record('Assignee starts work', 'OK', r.status === 200);
    r = await action(student, ticketId, { action: 'withdraw' });
    record('Citizen withdraws after work has started', 'Rejected', r.status === 403, r.body.error);
    r = await action(assignee, ticketId, { action: 'resolve' });
    record('Resolve without a note', 'Rejected', r.status === 403, r.body.error);
    r = await action(assignee, ticketId, { action: 'resolve', comment: 'Replaced the access point.' });
    record('Resolve with a note', 'OK', r.status === 200);
    r = await action(assignee, ticketId, { action: 'start' });
    record('RESOLVED to IN_PROGRESS', 'Rejected by trigger', r.status === 409, r.body.error);
    r = await action(assignee, ticketId, { action: 'close', rating: 5 });
    record('Staff tries to close the citizen\'s ticket', 'Rejected', r.status === 403, r.body.error);
    r = await action(student, ticketId, { action: 'reopen' });
    record('Reopen without a reason', 'Rejected', r.status === 403, r.body.error);
    r = await action(student, ticketId, { action: 'reopen', comment: 'Still disconnecting.' });
    record('Citizen reopens', 'OK', r.status === 200);
    await action(assignee, ticketId, { action: 'start' });
    await action(assignee, ticketId, { action: 'resolve', comment: 'Updated the router firmware.' });
    r = await action(student, ticketId, { action: 'close', rating: 9 });
    record('Close with rating 9', 'Rejected by CHECK', r.status === 400, r.body.error);
    r = await action(student, ticketId, { action: 'close', rating: 4 });
    record('Close with rating 4', 'OK', r.status === 200);
    r = await call('GET', `/api/tickets/${ticketId}`, { cookie: student });
    const steps = r.body.history?.map((h) => h.new_status).join(' > ');
    record('History holds every step', '8 steps ending in CLOSED', r.body.history?.length === 8 && steps.endsWith('CLOSED'), steps);
    r = await call('POST', `/api/tickets/${ticketId}/comments`, { cookie: student, body: { body: 'thanks' } });
    record('Comment on a closed ticket', 'Rejected', r.status === 400, r.body.error);

    r = await call('POST', '/api/tickets', { cookie: student, body: { ...complaint, title: 'Api test withdraw this one', deptId: itDept } });
    const withdrawId = r.body.ticketId;
    r = await action(student, withdrawId, { action: 'close', rating: 5 });
    record('Close a ticket that is not resolved', 'Rejected', r.status === 403, r.body.error);
    r = await action(student, withdrawId, { action: 'withdraw' });
    record('Withdraw an assigned ticket', 'OK', r.status === 200);

    section('Concurrency and assignment');
    r = await call('POST', '/api/tickets', { cookie: student, body: { title: 'Api test bus air conditioning', description: 'The AC in bus number 9 has not been working for a week now.', deptId: transportDept } });
    const busId = r.body.ticketId;
    const status = (await db.query('SELECT status FROM tickets WHERE ticket_id = $1', [busId])).rows[0].status;
    record('No available staff in the department', 'Stays OPEN', status === 'OPEN', status);
    const [a, b] = await Promise.all([action(kiran, busId, { action: 'claim' }), action(transportHead, busId, { action: 'claim' })]);
    const loser = a.status === 200 ? b : a;
    record('Two staff pick up the same ticket at the same moment', 'One succeeds, one gets an error',
      [a.status, b.status].sort().join() === '200,409', loser.body.error);
    r = await action(transportHead, busId, { action: 'assign', staffId: (await db.query(`SELECT user_id FROM users WHERE email = 'ravi.it@campus.edu'`)).rows[0].user_id });
    record('Head assigns to staff of another department', 'Rejected by trigger', r.status === 409, r.body.error);
    r = await action(kiran, busId, { action: 'assign', staffId: 1 });
    record('Staff tries to assign', 'Rejected', r.status === 403, r.body.error);

    section('Following a ticket');
    const liftId = (await db.query(`SELECT ticket_id FROM tickets WHERE title = 'Lift not working in new block'`)).rows[0].ticket_id;
    r = await call('POST', `/api/tickets/${liftId}/support`, { cookie: student });
    record('Citizen follows a ticket', 'OK', r.status === 201);
    r = await call('POST', `/api/tickets/${liftId}/support`, { cookie: student });
    record('Follow the same ticket twice', 'Rejected by composite PK', r.status === 409, r.body.error);
    r = await call('DELETE', `/api/tickets/${liftId}/support`, { cookie: student });
    record('Stop following (DELETE)', 'OK', r.status === 200);
    r = await call('DELETE', `/api/tickets/${liftId}/support`, { cookie: student });
    record('Stop following a ticket not followed', 'Rejected', r.status === 404, r.body.error);
    r = await call('DELETE', `/api/tickets/${liftId}/support`, { cookie: ravi });
    record('Staff calls stop following', 'Forbidden', r.status === 403, r.body.error);

    section('Search');
    r = await call('GET', '/api/tickets?q=elevator&mode=keyword', { cookie: admin });
    const keyword = r.body.tickets.map((t) => t.title);
    r = await call('GET', '/api/tickets?q=elevator&mode=semantic', { cookie: admin });
    const semantic = r.body.tickets.map((t) => t.title);
    record('Semantic search finds "Lift" when searching "elevator"', 'Keyword misses it, semantic finds it',
      !keyword.some((t) => t.includes('Lift')) && semantic.some((t) => t.includes('Lift')), `keyword ${keyword.length}, semantic ${semantic.length}`);

    section('Admin rules');
    r = await call('PATCH', `/api/departments/${itDept}`, { cookie: admin, body: { description: 'x', slaHours: 24, headId: 3 } });
    record('Set a normal staff member as department head', 'Rejected by trigger', r.status === 409, r.body.error);
    r = await call('PATCH', `/api/departments/${itDept}`, { cookie: admin, body: { description: 'x', slaHours: 1000, headId: 2 } });
    record('Set SLA to 1000 hours', 'Rejected by CHECK', r.status === 400, r.body.error);

    section('Access control');
    const checks = [
      ['Citizen calls the admin dashboard API', 'GET', '/api/dashboard/admin', student, 403],
      ['IT staff opens a ticket of another department', 'GET', `/api/tickets/${busId}`, ravi, 404],
      ['Citizen opens someone else\'s ticket', 'GET', `/api/tickets/${liftId}`, student, 404],
      ['No login calls the tickets API', 'GET', '/api/tickets', null, 401],
    ];
    for (const [name, method, url, cookie, want] of checks) {
      r = await call(method, url, { cookie });
      record(name, String(want), r.status === want, `got ${r.status}`);
    }
    const pages = [
      ['Citizen opens /admin', '/admin', student, '/citizen'],
      ['Not logged in opens /staff', '/staff', null, '/login'],
      ['Staff opens /head', '/head', ravi, '/staff'],
    ];
    for (const [name, url, cookie, want] of pages) {
      r = await call('GET', url, { cookie });
      record(name, `Redirect to ${want}`, r.location === want, `${r.status} to ${r.location}`);
    }

    r = await call('GET', `/api/tickets/${liftId}`, { cookie: head });
    record('Head of another department cannot open it', '404', r.status === 404, `got ${r.status}`);
  } finally {
    await cleanup();
    await db.end();
  }

  process.exit(writeResults() ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
