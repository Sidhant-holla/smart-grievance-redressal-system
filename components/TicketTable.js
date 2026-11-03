import Link from 'next/link';
import { StatusBadge, PriorityBadge } from './StatusBadge';
import { formatDate, timeFromNow } from '@/lib/format';

// Table of tickets used by the citizen, staff and admin pages.
// showDept / showCreator hide columns that are not useful for that role.
export default function TicketTable({ tickets, showDept = true, showCreator = true, showScore = false }) {
  if (tickets.length === 0) {
    return <p className="empty">No tickets found.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Title</th>
            {showDept && <th>Department</th>}
            {showCreator && <th>Raised by</th>}
            <th>Priority</th>
            <th>Status</th>
            <th>Assigned to</th>
            <th>Due</th>
            <th>Created</th>
            {showScore && <th>Match</th>}
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.ticket_id} className={t.is_overdue ? 'overdue' : ''}>
              <td>{t.ticket_id}</td>
              <td>
                <Link href={`/tickets/${t.ticket_id}`}>{t.title}</Link>
                {t.supporter_count > 0 && <div className="muted">+{t.supporter_count} others reported this</div>}
                {t.possible_duplicate_of && <div className="muted">Possible duplicate of #{t.possible_duplicate_of}</div>}
              </td>
              {showDept && <td>{t.dept_name}</td>}
              {showCreator && <td>{t.created_by_name}</td>}
              <td>
                <PriorityBadge priority={t.priority} />
              </td>
              <td>
                <StatusBadge status={t.status} />
                {t.is_overdue && (
                  <div style={{ marginTop: 4 }}>
                    <span className="badge overdue">OVERDUE</span>
                  </div>
                )}
              </td>
              <td>{t.assigned_to_name || <span className="muted">Unassigned</span>}</td>
              <td className="muted">{t.is_open ? timeFromNow(t.due_at) : '-'}</td>
              <td className="muted">{formatDate(t.created_at)}</td>
              {showScore && <td>{t.similarity ?? t.rank}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
