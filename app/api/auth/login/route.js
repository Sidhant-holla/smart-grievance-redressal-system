import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { createToken, setLoginCookie } from '@/lib/auth';
import { jsonError } from '@/lib/api';
import { HOME_PAGE } from '@/lib/users';

export async function POST(request) {
  const { email, password } = await request.json();
  if (!email || !password) return jsonError('Email and password are required');

  // LEFT JOIN because citizens and admins have no staff row (dept_id is NULL)
  const result = await query(
    `SELECT u.user_id, u.full_name, u.role, u.password_hash, u.is_active, s.dept_id
       FROM users u
       LEFT JOIN staff s ON s.staff_id = u.user_id
      WHERE lower(u.email) = lower($1)`,
    [email]
  );
  const user = result.rows[0];

  // same message for "no such user" and "wrong password" so emails can't be guessed
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return jsonError('Invalid email or password', 401);
  }
  if (!user.is_active) return jsonError('This account has been deactivated', 403);

  // staff and heads need a row in the staff table, otherwise they have no department
  if ((user.role === 'staff' || user.role === 'dept_head') && !user.dept_id) {
    return jsonError('This account is not linked to a department. Please ask the admin to add it to the staff table.', 403);
  }

  const token = await createToken(user);
  const response = NextResponse.json({ role: user.role, redirect: HOME_PAGE[user.role] });
  setLoginCookie(response, token);
  return response;
}
