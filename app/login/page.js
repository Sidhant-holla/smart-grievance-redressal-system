'use client';

import Link from 'next/link';
import { useState } from 'react';

// Login form. Each useState holds one value the page needs to remember.
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Runs when the form is submitted. It calls our API route, which checks the password.
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }
    // full reload so the navbar and middleware pick up the new cookie
    window.location.href = data.redirect;
  }

  return (
    <div className="auth-box">
      <div className="card">
        <h1>Login</h1>
        <p className="subtitle">Citizens, staff, department heads and admins all log in here.</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </form>

        <p className="muted" style={{ marginTop: 16 }}>
          New here? <Link href="/register">Create an account</Link>
        </p>
      </div>

      <div className="card">
        <h3>Demo accounts (password: Password@123)</h3>
        <div className="muted">
          admin@campus.edu - Admin
          <br />
          head.it@campus.edu - IT Services head
          <br />
          ravi.it@campus.edu - IT Services staff
          <br />
          ananya@student.campus.edu - Citizen
        </div>
      </div>
    </div>
  );
}
