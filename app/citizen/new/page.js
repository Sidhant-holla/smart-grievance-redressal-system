'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/format';

// Two steps:
//  1. citizen writes the complaint -> "Check for similar complaints"
//     (server embeds the text and runs the vector similarity functions)
//  2. we show possible duplicates + the suggested department, then submit
export default function NewTicketPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', location: '', priority: 'MEDIUM', deptId: '' });
  const [checkResult, setCheckResult] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []));
  }, []);

  function update(field, value) {
    setForm({ ...form, [field]: value });
    // text changed -> the old similarity check is no longer valid
    if (field === 'title' || field === 'description') setCheckResult(null);
  }

  async function checkSimilar(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await fetch('/api/tickets/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: form.title, description: form.description }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setCheckResult(data);
    // pre-select the department with the highest score (user can still change it)
    if (data.suggestions.length > 0 && !form.deptId) {
      setForm((f) => ({ ...f, deptId: String(data.suggestions[0].dept_id) }));
    }
  }

  async function supportExisting(ticketId) {
    setError('');
    const res = await fetch(`/api/tickets/${ticketId}/support`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setMessage(`You are now following ticket #${ticketId}. You will be notified when its status changes.`);
    setTimeout(() => router.push('/citizen'), 1800);
  }

  async function submitTicket() {
    setError('');
    if (!form.deptId) {
      setError('Please choose a department');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    router.push(`/tickets/${data.ticketId}`);
  }

  return (
    <>
      <h1>Raise a complaint</h1>
      <p className="subtitle">Describe the problem in your own words. We will check if someone has already reported it.</p>

      {error && <div className="error">{error}</div>}
      {message && <div className="success-msg">{message}</div>}

      <div className="grid-2">
        <div className="card">
          <form onSubmit={checkSimilar}>
            <label>Title</label>
            <input
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. Wi-Fi not working in Block C hostel"
              minLength={5}
              maxLength={150}
              required
            />

            <label>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="What is the problem, since when, how is it affecting you?"
              minLength={20}
              required
            />

            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Location (optional)</label>
                <input value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="Block / room" />
              </div>
              <div style={{ flex: 1 }}>
                <label>Priority</label>
                <select value={form.priority} onChange={(e) => update('priority', e.target.value)}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High (half the normal deadline)</option>
                </select>
              </div>
            </div>

            {!checkResult && (
              <div style={{ marginTop: 16 }}>
                <button type="submit" disabled={busy}>
                  {busy ? 'Checking...' : 'Check for similar complaints'}
                </button>
              </div>
            )}
          </form>

          {checkResult && (
            <>
              <label>Department</label>
              <select value={form.deptId} onChange={(e) => update('deptId', e.target.value)}>
                <option value="">-- choose --</option>
                {departments.map((d) => (
                  <option key={d.dept_id} value={d.dept_id}>
                    {d.name} (SLA {d.sla_hours}h)
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 16 }}>
                <button onClick={submitTicket} disabled={busy}>
                  {busy ? 'Submitting...' : 'Submit as a new complaint'}
                </button>
              </div>
            </>
          )}
        </div>

        <div>
          {checkResult && (
            <>
              <div className="card">
                <h2>Similar open complaints</h2>
                {checkResult.similar.length === 0 ? (
                  <p className="muted">Nothing similar is open right now. Please go ahead and submit.</p>
                ) : (
                  <>
                    <p className="muted">If one of these is your problem, follow it instead of creating a duplicate.</p>
                    {checkResult.similar.map((s) => (
                      <div key={s.ticket_id} className="similar-item">
                        <div className="row spread">
                          <strong>#{s.ticket_id}</strong>
                          <span className="muted">{Math.round(s.similarity * 100)}% similar</span>
                        </div>
                        <div>{s.title}</div>
                        <div className="row" style={{ marginTop: 6 }}>
                          <StatusBadge status={s.status} />
                          <span className="muted">
                            {s.dept_name} - {formatDate(s.created_at)}
                          </span>
                        </div>
                        <button className="small secondary" style={{ marginTop: 8 }} onClick={() => supportExisting(s.ticket_id)}>
                          I have the same problem
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="card">
                <h2>Suggested department</h2>
                {checkResult.suggestions.length === 0 ? (
                  <p className="muted">No past cases to learn from. Please choose the department yourself.</p>
                ) : (
                  <>
                    <p className="muted">Based on which departments handled the most similar past complaints.</p>
                    <table>
                      <tbody>
                        {checkResult.suggestions.map((s) => (
                          <tr key={s.dept_id}>
                            <td>{s.dept_name}</td>
                            <td className="muted">{s.matches} similar cases</td>
                            <td>{s.score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
