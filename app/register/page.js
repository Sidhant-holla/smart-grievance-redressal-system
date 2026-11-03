'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function RegisterPage() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: form.fullName, email: form.email, password: form.password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }
    window.location.href = data.redirect;
  }

  return (
    <div className="auth-box">
      <div className="card">
        <h1>Create account</h1>
        <p className="subtitle">Register as a citizen to raise and track complaints.</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>Full name</label>
          <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />

          <label>Email</label>
          <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />

          <label>Password (min 8 characters)</label>
          <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required />

          <label>Confirm password</label>
          <input type="password" value={form.confirm} onChange={(e) => update('confirm', e.target.value)} required />

          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Register'}
            </button>
          </div>
        </form>

        <p className="muted" style={{ marginTop: 16 }}>
          Already have an account? <Link href="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}
