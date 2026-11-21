// Account creation, shared by the Register page and the admin Users page
import bcrypt from 'bcryptjs';
import { withTransaction } from './db';

export const HOME_PAGE = { citizen: '/citizen', staff: '/staff', dept_head: '/head', admin: '/admin' };

// Staff and heads belong to a department. Citizens and admins do not.
function needsDepartment(role) {
  return role === 'staff' || role === 'dept_head';
}

// Returns an error message, or null if the details are fine. Name and email
// format are checked by CHECK constraints in the users table. Password length
// has to be checked here because the database only ever sees the hash.
export function accountProblem({ fullName, email, password, role, deptId }) {
  if (!fullName || !email || !password) return 'All fields are required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!HOME_PAGE[role]) return 'Invalid role';
  if (needsDepartment(role) && !deptId) return 'Staff and department heads need a department';
  return null;
}

// For staff and heads several tables are written (users + staff + departments),
// so it is one transaction: either all the rows are created or none of them.
export async function createAccount({ fullName, email, password, role, deptId, designation }) {
  // bcrypt turns the password into a one-way hash. 10 is the cost, which makes guessing slow.
  // The plain password is never stored (requirement 13).
  const passwordHash = await bcrypt.hash(password, 10);
  const department = needsDepartment(role) ? deptId : null;

  return withTransaction(async (client) => {
    // $1, $2 ... are placeholders. The values are sent separately, so this is safe from SQL injection.
    const inserted = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id, full_name, role`,
      [fullName.trim(), email.trim(), passwordHash, role]
    );
    const user = inserted.rows[0];

    if (department) {
      await client.query('INSERT INTO staff (staff_id, dept_id, designation) VALUES ($1, $2, $3)', [
        user.user_id,
        department,
        designation?.trim() || (role === 'dept_head' ? 'Head of Department' : 'Staff'),
      ]);
    }
    // a new head replaces the old head of that department
    if (role === 'dept_head') {
      await client.query('UPDATE departments SET head_id = $1 WHERE dept_id = $2', [user.user_id, department]);
    }
    return { ...user, dept_id: department };
  });
}
