import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { createToken, setLoginCookie } from '@/lib/auth';
import { jsonError, dbError } from '@/lib/api';

// Public sign-up is only for citizens (students). Staff, heads and admins
// are created by the admin from the Users page.
export async function POST(request) {
  const { fullName, email, password } = await request.json();

  if (!fullName || !email || !password) return jsonError('All fields are required');
  // the database only ever sees the hash, so password length is checked here
  if (password.length < 8) return jsonError('Password must be at least 8 characters');

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    // name and email format are validated by CHECK constraints in the users table
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'citizen')
       RETURNING user_id, full_name, role`,
      [fullName.trim(), email.trim(), passwordHash]
    );
    const token = await createToken(result.rows[0]);
    const response = NextResponse.json({ redirect: '/citizen' }, { status: 201 });
    setLoginCookie(response, token);
    return response;
  } catch (err) {
    if (err.code === '23505') return jsonError('An account with this email already exists', 409);
    return dbError(err);
  }
}
