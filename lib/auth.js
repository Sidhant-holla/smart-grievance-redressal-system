// Login session handling. After login we put a signed JWT in an httpOnly
// cookie, so the browser's JavaScript cannot read it.
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const COOKIE_NAME = 'grievance_token';

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

export async function createToken(user) {
  return new SignJWT({ id: user.user_id, name: user.full_name, role: user.role, deptId: user.dept_id ?? null })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('8h')
    .sign(getSecret());
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

// Returns { id, name, role, deptId } of the logged in user, or null
export async function getCurrentUser() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function setLoginCookie(response, token) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
}
