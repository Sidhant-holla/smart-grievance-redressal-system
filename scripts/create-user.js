// Creates an admin, staff member, department head or citizen from the terminal.
// Needed for the first admin: the website only lets an admin create these
// accounts, so a database without seed data has no way in otherwise.
//
// Usage:
//   npm run create-user -- admin "Priya Sharma" priya@campus.edu MyPassword123
//   npm run create-user -- staff "Ravi Menon" ravi@campus.edu MyPassword123 "IT Services"
//   npm run create-user -- dept_head "Suresh Kumar" suresh@campus.edu MyPassword123 "IT Services"

const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const USAGE = `Usage: npm run create-user -- <role> "<full name>" <email> <password> ["<department>"]
Role is admin, staff, dept_head or citizen. Staff and dept_head need a department.`;

// Creates the account. process.argv holds the values typed after the npm command.
async function main() {
  const [role, fullName, email, password, department] = process.argv.slice(2);

  if (!role || !fullName || !email || !password) throw new Error(USAGE);
  if (!['admin', 'staff', 'dept_head', 'citizen'].includes(role)) throw new Error(USAGE);
  if (password.length < 8) throw new Error('Password must be at least 8 characters');

  const needsDepartment = role === 'staff' || role === 'dept_head';
  if (needsDepartment && !department) throw new Error(USAGE);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    let deptId = null;
    if (needsDepartment) {
      const dept = await db.query('SELECT dept_id FROM departments WHERE lower(name) = lower($1)', [department]);
      if (dept.rowCount === 0) {
        const all = await db.query('SELECT name FROM departments ORDER BY name');
        const names = all.rows.map((row) => row.name).join(', ') || '(none yet, create one first)';
        throw new Error(`Department "${department}" not found. Departments: ${names}`);
      }
      deptId = dept.rows[0].dept_id;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // same steps as POST /api/users: all the rows are created or none of them
    await db.query('BEGIN');
    const inserted = await db.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id',
      [fullName, email, passwordHash, role]
    );
    const userId = inserted.rows[0].user_id;

    if (needsDepartment) {
      await db.query('INSERT INTO staff (staff_id, dept_id, designation) VALUES ($1, $2, $3)', [
        userId,
        deptId,
        role === 'dept_head' ? 'Head of Department' : 'Staff',
      ]);
    }
    if (role === 'dept_head') {
      await db.query('UPDATE departments SET head_id = $1 WHERE dept_id = $2', [userId, deptId]);
    }
    await db.query('COMMIT');

    console.log(`Created ${role} ${email}${department ? ' in ' + department : ''}. You can log in now.`);
  } catch (err) {
    await db.query('ROLLBACK');
    if (err.code === '23505') throw new Error('An account with this email already exists');
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
