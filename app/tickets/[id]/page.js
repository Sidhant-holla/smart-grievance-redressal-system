'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { formatDate, timeFromNow } from '@/lib/format';

export default function TicketDetailPage({ params }) {
  const router = useRouter();
  const ticketId = params.id;
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // inputs used by the action buttons
  const [note, setNote] = useState('');
  const [rating, setRating] = useState('5');
  const [staffId, setStaffId] = useState('');
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);

  async function load() {
    const res = await fetch(`/api/tickets/${ticketId}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    setData(await res.json());
  }

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((d) => setUser(d.user));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function doAction(action, extra = {}) {
    setError('');
    const res = await fetch(`/api/tickets/${ticketId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const result = await res.json();
    if (!res.ok) {
      // e.g. "Ticket #12 was already picked up by someone else" from the stored procedure
      setError(result.error);
    } else {
      setNote('');
    }
    load();
  }

  async function addComment(e) {
    e.preventDefault();
    setError('');
    const res = await fetch(`/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: comment, isInternal: internal }),
    });
    const result = await res.json();
    if (!res.ok) {
      setError(result.error);
      return;
    }
    setComment('');
    setInternal(false);
    load();
  }

  if (notFound) return <div className="error">Ticket not found or you do not have access to it.</div>;
  if (!data || !user) return <p className="muted">Loading...</p>;

  const { ticket, history, comments, staffList } = data;
  const s = ticket.status;
  const isOwner = ticket.created_by === user.id;
  const isStaff = user.role === 'staff' || user.role === 'dept_head';
  const isManager = user.role === 'dept_head' || user.role === 'admin';
  const assignedToMe = ticket.assigned_to === user.id;

  // which buttons to show (the database checks these rules again)
  const canClaim = isStaff && s === 'OPEN' && !ticket.assigned_to;
  const canAssign = isManager && ['OPEN', 'ASSIGNED', 'ESCALATED', 'REOPENED'].includes(s);
  const canStart = assignedToMe && ['ASSIGNED', 'ESCALATED', 'REOPENED'].includes(s);
  const canResolve = (assignedToMe || isManager) && ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(s);
  const canConfirm = isOwner && s === 'RESOLVED';
  const canWithdraw = isOwner && ['OPEN', 'ASSIGNED'].includes(s);

  return (
    <>
      <p>
        <button className="small secondary" onClick={() => router.back()}>
          &larr; Back
        </button>
      </p>
      <div className="row spread">
        <div>
          <h1>
            #{ticket.ticket_id} {ticket.title}
          </h1>
          <div className="row" style={{ marginBottom: 16 }}>
            <StatusBadge status={s} />
            <PriorityBadge priority={ticket.priority} />
            {ticket.is_overdue && <span className="badge overdue">OVERDUE</span>}
            {ticket.escalation_count > 0 && <span className="muted">Escalated {ticket.escalation_count} time(s)</span>}
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Description</h2>
            <p className="description">{ticket.description}</p>
            {ticket.possible_duplicate_of &&
              (user.role === 'citizen' ? (
                // citizens cannot open other people's tickets, so no link here
                <div className="info">
                  This looks similar to ticket #{ticket.possible_duplicate_of}, so staff may handle them together.
                </div>
              ) : (
                <div className="info">
                  This looks very similar to ticket{' '}
                  <Link href={`/tickets/${ticket.possible_duplicate_of}`}>#{ticket.possible_duplicate_of}</Link>, which
                  was still open when this one was submitted.
                </div>
              ))}
          </div>

          {/* ---------- actions ---------- */}
          {(canClaim || canAssign || canStart || canResolve || canConfirm || canWithdraw) && (
            <div className="card">
              <h2>Actions</h2>

              {canClaim && (
                <p>
                  <button onClick={() => doAction('claim')}>Pick up this ticket</button>
                </p>
              )}

              {canAssign && (
                <div className="row" style={{ marginBottom: 12 }}>
                  <select className="inline-input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                    <option value="">-- assign to --</option>
                    {staffList.map((st) => (
                      <option key={st.staff_id} value={st.staff_id}>
                        {st.full_name} ({st.active_tickets} active{st.is_available ? '' : ', unavailable'})
                      </option>
                    ))}
                  </select>
                  <button onClick={() => doAction('assign', { staffId: Number(staffId) })} disabled={!staffId}>
                    {ticket.assigned_to ? 'Re-assign' : 'Assign'}
                  </button>
                </div>
              )}

              {canStart && (
                <p>
                  <button className="secondary" onClick={() => doAction('start')}>
                    Start work (In Progress)
                  </button>
                </p>
              )}

              {canResolve && (
                <>
                  <label>Resolution note</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What was done to fix the problem?"
                    style={{ minHeight: 70 }}
                  />
                  <button className="success" style={{ marginTop: 8 }} onClick={() => doAction('resolve', { comment: note })}>
                    Mark as resolved
                  </button>
                </>
              )}

              {canConfirm && (
                <>
                  <p>The staff marked this as resolved. Is the problem fixed?</p>
                  <div className="row">
                    <select className="inline-input" value={rating} onChange={(e) => setRating(e.target.value)}>
                      <option value="5">5 - Excellent</option>
                      <option value="4">4 - Good</option>
                      <option value="3">3 - Okay</option>
                      <option value="2">2 - Poor</option>
                      <option value="1">1 - Very poor</option>
                    </select>
                    <button className="success" onClick={() => doAction('close', { rating: Number(rating) })}>
                      Yes, close ticket
                    </button>
                  </div>
                  <label>Not fixed? Tell us why</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 60 }} />
                  <button className="danger" style={{ marginTop: 8 }} onClick={() => doAction('reopen', { comment: note })}>
                    Reopen ticket
                  </button>
                </>
              )}

              {canWithdraw && (
                <p>
                  <button className="danger" onClick={() => doAction('withdraw')}>
                    Withdraw complaint
                  </button>
                </p>
              )}
            </div>
          )}

          {/* ---------- comments ---------- */}
          <div className="card">
            <h2>Comments</h2>
            {comments.length === 0 && <p className="muted">No comments yet.</p>}
            {comments.map((c) => (
              <div key={c.comment_id} className={c.is_internal ? 'comment internal' : 'comment'}>
                <div className="row spread">
                  <strong>
                    {c.full_name} <span className="muted">({c.role.replace('_', ' ')})</span>
                  </strong>
                  <span className="muted">
                    {c.is_internal && 'Internal note - '}
                    {formatDate(c.created_at)}
                  </span>
                </div>
                <div className="description">{c.body}</div>
              </div>
            ))}

            {s !== 'CLOSED' && (
              <form onSubmit={addComment} style={{ marginTop: 12 }}>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write a comment"
                  style={{ minHeight: 60 }}
                  required
                />
                <div className="row spread" style={{ marginTop: 8 }}>
                  {user.role !== 'citizen' ? (
                    <label className="checkbox">
                      <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                      Internal note (hidden from citizen)
                    </label>
                  ) : (
                    <span />
                  )}
                  <button type="submit">Post</button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Details</h2>
            <div className="meta">
              <div>Department</div>
              <div>{ticket.dept_name}</div>
              <div>Raised by</div>
              <div>{ticket.created_by_name}</div>
              <div>Assigned to</div>
              <div>{ticket.assigned_to_name || 'Not assigned yet'}</div>
              <div>Location</div>
              <div>{ticket.location || '-'}</div>
              <div>Created</div>
              <div>{formatDate(ticket.created_at)}</div>
              <div>Due</div>
              <div>
                {formatDate(ticket.due_at)} {ticket.is_open && <span className="muted">({timeFromNow(ticket.due_at)})</span>}
              </div>
              <div>Resolved</div>
              <div>{formatDate(ticket.resolved_at)}</div>
              <div>Supporters</div>
              <div>{ticket.supporter_count} other people</div>
              {ticket.rating && (
                <>
                  <div>Rating</div>
                  <div>{ticket.rating} / 5</div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Status history</h2>
            <ul className="timeline">
              {history.map((h) => (
                <li key={h.history_id}>
                  <div>
                    {h.old_status ? (
                      <>
                        {h.old_status === h.new_status ? 'Re-assigned' : `${h.old_status} → ${h.new_status}`}
                      </>
                    ) : (
                      'Ticket created'
                    )}
                    {h.assigned_to_name && h.new_status === 'ASSIGNED' && <> to {h.assigned_to_name}</>}
                  </div>
                  <div className="muted">
                    by {h.changed_by_name} - {formatDate(h.changed_at)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
