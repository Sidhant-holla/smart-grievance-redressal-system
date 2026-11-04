'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  password: '',
  confirm: '',
  role: 'citizen',
  deptId: '',
  designation: '',
  signupCode: '',
};

export default function RegisterPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isCitizen = form.role === 'citizen';
  const needsDepartment = form.role === 'staff' || form.role === 'dept_head';

  useEffect(() => {
    fetch('/api/departments/list')
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []));
  }, []);

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
      body: JSON.stringify({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        role: form.role,
        deptId: needsDepartment ? Number(form.deptId) : null,
        designation: form.designation,
        signupCode: form.signupCode,
      }),
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
        <p className="subtitle">Students can register freely. Other roles need the access code.</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>Account type</label>
          <select value={form.role} onChange={(e) => update('role', e.target.value)}>
            <option value="citizen">Citizen (student)</option>
            <option value="staff">Staff</option>
            <option value="dept_head">Department head</option>
            <option value="admin">Admin</option>
          </select>

          <label>Full name</label>
          <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />

          <label>Email</label>
          <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />

          <label>Password (min 8 characters)</label>
          <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required />

          <label>Confirm password</label>
          <input type="password" value={form.confirm} onChange={(e) => update('confirm', e.target.value)} required />

          {needsDepartment && (
            <>
              <label>Department</label>
              <select value={form.deptId} onChange={(e) => update('deptId', e.target.value)} required>
                <option value="">-- choose --</option>
                {departments.map((d) => (
                  <option key={d.dept_id} value={d.dept_id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {departments.length === 0 && (
                <p className="muted">No departments yet. Create an admin account first and add them from the admin page.</p>
              )}

              <label>Designation (optional)</label>
              <input
                value={form.designation}
                onChange={(e) => update('designation', e.target.value)}
                placeholder="e.g. Network Engineer"
              />
              {form.role === 'dept_head' && (
                <p className="muted">You will replace the current head of this department.</p>
              )}
            </>
          )}

          {!isCitizen && (
            <>
              <label>Access code</label>
              <input
                type="password"
                value={form.signupCode}
                onChange={(e) => update('signupCode', e.target.value)}
                required
              />
            </>
          )}

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
