import { NextResponse } from 'next/server';
import { createToken, setLoginCookie } from '@/lib/auth';
import { jsonError, dbError } from '@/lib/api';
import { accountProblem, createAccount, HOME_PAGE } from '@/lib/users';

// Anyone can sign up as a citizen. Staff, head and admin accounts also need
// the access code from STAFF_SIGNUP_CODE, otherwise anyone who opens the site
// could make themselves an admin. If the code is not set, those roles are
// turned off here (the admin can still create them from the Users page).
export async function POST(request) {
  const { fullName, email, password, role = 'citizen', deptId, designation, signupCode } = await request.json();

  const problem = accountProblem({ fullName, email, password, role, deptId });
  if (problem) return jsonError(problem);

  if (role !== 'citizen') {
    const code = process.env.STAFF_SIGNUP_CODE;
    if (!code) return jsonError('Staff sign-up is turned off. Set STAFF_SIGNUP_CODE in .env.local and restart the app.', 403);
    if (signupCode !== code) return jsonError('Wrong access code', 403);
  }

  try {
    const user = await createAccount({ fullName, email, password, role, deptId, designation });
    const token = await createToken(user);
    const response = NextResponse.json({ redirect: HOME_PAGE[role] }, { status: 201 });
    setLoginCookie(response, token);
    return response;
  } catch (err) {
    if (err.code === '23505') return jsonError('An account with this email already exists', 409);
    return dbError(err);
  }
}
