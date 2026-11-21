'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/format';

// Shows notifications. These rows are created by the ticket_after_change trigger.
export default function NotificationsPage() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    fetch('/api/notifications')
      .then((res) => res.json())
      .then((data) => {
        setItems(data.notifications || []);
        // opening the page marks everything as read
        fetch('/api/notifications', { method: 'POST' });
      });
  }, []);

  return (
    <>
      <h1>Notifications</h1>
      <p className="subtitle">These are created by database triggers when a ticket is assigned, escalated or changes status.</p>
      <div className="card">
        {items === null && <p className="muted">Loading...</p>}
        {items && items.length === 0 && <p className="empty">No notifications.</p>}
        {items &&
          items.map((n) => (
            <div key={n.notification_id} className="comment">
              <div className="row spread">
                <span>
                  {!n.is_read && <span className="badge OPEN">NEW</span>} {n.message}
                </span>
                <span className="muted">{formatDate(n.created_at)}</span>
              </div>
              {n.ticket_id && <Link href={`/tickets/${n.ticket_id}`}>View ticket #{n.ticket_id}</Link>}
            </div>
          ))}
      </div>
    </>
  );
}
