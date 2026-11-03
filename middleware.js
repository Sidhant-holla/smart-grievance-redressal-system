// Runs before every page request. Sends users who are not logged in to the
// login page and stops users from opening another role's pages.
// (The API routes check roles again on their own - this is only for pages.)
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'grievance_token';

// which roles may open which section of the site
const ROLE_PAGES = {
  '/citizen': ['citizen'],
  '/staff': ['staff', 'dept_head'],
  '/head': ['dept_head'],
  '/admin': ['admin'],
  '/tickets': ['citizen', 'staff', 'dept_head', 'admin'],
  '/notifications': ['citizen', 'staff', 'dept_head', 'admin'],
};

const HOME_PAGE = {
  citizen: '/citizen',
  staff: '/staff',
  dept_head: '/head',
  admin: '/admin',
};

async function readUser(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const user = await readUser(request);

  // logged in users do not need the landing / login / register pages
  if (pathname === '/' || pathname === '/login' || pathname === '/register') {
    if (user) return NextResponse.redirect(new URL(HOME_PAGE[user.role], request.url));
    return NextResponse.next();
  }

  const section = Object.keys(ROLE_PAGES).find((prefix) => pathname.startsWith(prefix));
  if (!section) return NextResponse.next();

  if (!user) return NextResponse.redirect(new URL('/login', request.url));
  if (!ROLE_PAGES[section].includes(user.role)) {
    return NextResponse.redirect(new URL(HOME_PAGE[user.role], request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/citizen/:path*', '/staff/:path*', '/head/:path*', '/admin/:path*', '/tickets/:path*', '/notifications'],
};
