'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Add departments and change their SLA and head.
export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [newDept, setNewDept] = useState({ name: '', description: '', slaHours: 72 });
  const [editing, setEditing] = useState(null); // department being edited
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []));
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(data.staff || []));
  }

  useEffect(load, []);

  // A bad SLA is rejected by the chk_sla_hours constraint and the error is shown on the page.
  async function createDepartment(e) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newDept, slaHours: Number(newDept.slaHours) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage('Department created');
    setNewDept({ name: '', description: '', slaHours: 72 });
    load();
  }

  // Saving a head who is not a dept_head of this department is rejected by a trigger.
  async function saveDepartment() {
    setError('');
    const res = await fetch(`/api/departments/${editing.dept_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: editing.description,
        slaHours: Number(editing.sla_hours),
        headId: editing.head_id ? Number(editing.head_id) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage('Department updated');
    setEditing(null);
    load();
  }

  return (
    <>
      <h1>Departments</h1>
      <p className="subtitle">SLA hours decide when a ticket gets escalated.</p>

      {error && <div className="error">{error}</div>}
      {message && <div className="success-msg">{message}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>SLA (hours)</th>
                <th>Head</th>
                <th>Staff</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) =>
                editing?.dept_id === d.dept_id ? (
                  <tr key={d.dept_id}>
                    <td>{d.name}</td>
                    <td>
                      <input
                        value={editing.description || ''}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        style={{ width: 90 }}
                        value={editing.sla_hours}
                        onChange={(e) => setEditing({ ...editing, sla_hours: e.target.value })}
                      />
                    </td>
                    <td>
                      <select value={editing.head_id || ''} onChange={(e) => setEditing({ ...editing, head_id: e.target.value })}>
                        <option value="">-- none --</option>
                        {staff
                          .filter((s) => s.dept_id === d.dept_id && s.role === 'dept_head')
                          .map((s) => (
                            <option key={s.staff_id} value={s.staff_id}>
                              {s.full_name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>{d.staff_count}</td>
                    <td className="row">
                      <button className="small" onClick={saveDepartment}>
                        Save
                      </button>
                      <button className="small secondary" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.dept_id}>
                    <td>
                      <Link href={`/admin/departments/${d.dept_id}`}>{d.name}</Link>
                    </td>
                    <td className="muted">{d.description}</td>
                    <td>{d.sla_hours}</td>
                    <td>{d.head_name || <span className="muted">No head</span>}</td>
                    <td>{d.staff_count}</td>
                    <td>
                      <button className="small secondary" onClick={() => setEditing(d)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        <h2>Add department</h2>
        <form onSubmit={createDepartment}>
          <label>Name</label>
          <input value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })} required />
          <label>Description</label>
          <input value={newDept.description} onChange={(e) => setNewDept({ ...newDept, description: e.target.value })} />
          <label>SLA (hours, 1 - 720)</label>
          <input
            type="number"
            value={newDept.slaHours}
            onChange={(e) => setNewDept({ ...newDept, slaHours: e.target.value })}
            required
          />
          <div style={{ marginTop: 14 }}>
            <button type="submit">Create</button>
          </div>
        </form>
      </div>
    </>
  );
}
