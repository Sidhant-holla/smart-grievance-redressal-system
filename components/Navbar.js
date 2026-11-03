'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = {
  citizen: [
    { href: '/citizen', label: 'My Tickets' },
    { href: '/citizen/new', label: 'Raise Complaint' },
  ],
  staff: [{ href: '/staff', label: 'Ticket Queue' }],
  dept_head: [
    { href: '/head', label: 'Dashboard' },
    { href: '/staff', label: 'Ticket Queue' },
  ],
  admin: [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/tickets', label: 'All Tickets' },
    { href: '/admin/departments', label: 'Departments' },
    { href: '/admin/users', label: 'Users' },
  ],
};

const ROLE_NAMES = { citizen: 'Citizen', staff: 'Staff', dept_head: 'Dept Head', admin: 'Admin' };

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState(0);

  // reload on every page change so the notification count stays fresh
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user);
        setUnread(data.unreadNotifications || 0);
      });
  }, [pathname]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="brand">
          Grievance Portal
        </Link>

        <div className="links">
          {user &&
            LINKS[user.role].map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
        </div>

        {user ? (
          <div className="user">
            <Link href="/notifications">
              Notifications{unread > 0 && <span className="bell-count">{unread}</span>}
            </Link>
            <span>{user.name}</span>
            <span className="role-tag">{ROLE_NAMES[user.role]}</span>
            <button className="small secondary" onClick={logout}>
              Logout
            </button>
          </div>
        ) : (
          <div className="user">
            <Link href="/login">Login</Link>
            <Link href="/register">Register</Link>
          </div>
        )}
      </div>
    </nav>
  );
}
