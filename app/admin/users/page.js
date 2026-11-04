'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/format';

const EMPTY_FORM = { fullName: '', email: '', password: '', role: 'staff', deptId: '', designation: '' };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [roleFilter, setRoleFilter] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => setUsers(data.users || []));
  }

  useEffect(() => {
    load();
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []));
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, deptId: form.deptId ? Number(form.deptId) : null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage('User created');
    setForm(EMPTY_FORM);
    load();
  }

  async function toggleActive(u) {
    setError('');
    const res = await fetch(`/api/users/${u.user_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.is_active }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    load();
  }

  const shown = roleFilter ? users.filter((u) => u.role === roleFilter) : users;

  return (
    <>
      <h1>Users</h1>
      <p className="subtitle">Create an account with any role, or activate and deactivate existing users.</p>

      {error && <div className="error">{error}</div>}
      {message && <div className="success-msg">{message}</div>}

      <div className="grid-2">
        <div className="card">
          <div className="row spread" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>All users ({shown.length})</h2>
            <select className="inline-input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              <option value="citizen">Citizens</option>
              <option value="staff">Staff</option>
              <option value="dept_head">Dept heads</option>
              <option value="admin">Admins</option>
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.user_id}>
                    <td>
                      {u.full_name}
                      <div className="muted">{u.email}</div>
                    </td>
                    <td>{u.role.replace('_', ' ')}</td>
                    <td>{u.dept_name || '-'}</td>
                    <td className="muted">{formatDate(u.created_at)}</td>
                    <td>
                      <button className={u.is_active ? 'small secondary' : 'small danger'} onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>Add a user</h2>
          <form onSubmit={createUser}>
            <label>Full name</label>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <label>Temporary password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
            />
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="citizen">Citizen</option>
              <option value="staff">Staff</option>
              <option value="dept_head">Department head</option>
              <option value="admin">Admin</option>
            </select>
            {(form.role === 'staff' || form.role === 'dept_head') && (
              <>
                <label>Department</label>
                <select value={form.deptId} onChange={(e) => setForm({ ...form, deptId: e.target.value })} required>
                  <option value="">-- choose --</option>
                  {departments.map((d) => (
                    <option key={d.dept_id} value={d.dept_id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <label>Designation</label>
                <input
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder="e.g. Network Engineer"
                />
              </>
            )}
            {form.role === 'dept_head' && <p className="muted">The new head will replace the current head of that department.</p>}
            <div style={{ marginTop: 14 }}>
              <button type="submit">Create user</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
