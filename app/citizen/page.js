'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import TicketTable from '@/components/TicketTable';

// Citizen home page: the complaints they raised and the ones they follow.
export default function CitizenHome() {
  const [tickets, setTickets] = useState(null);
  const [userId, setUserId] = useState(null);

  // Runs once when the page opens. The data comes through the API, never directly from the database.
  useEffect(() => {
    fetch('/api/tickets')
      .then((res) => res.json())
      .then((data) => setTickets(data.tickets || []));
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => setUserId(data.user?.id ?? null));
  }, []);

  // Numbers for the three cards at the top of the page.
  const active = tickets ? tickets.filter((t) => t.is_open).length : 0;
  // only the person who raised a ticket can confirm it, so followed tickets are not counted
  const toConfirm = tickets ? tickets.filter((t) => t.status === 'RESOLVED' && t.created_by === userId).length : 0;

  return (
    <>
      <div className="row spread">
        <div>
          <h1>My Tickets</h1>
          <p className="subtitle">Complaints you raised and complaints you are following.</p>
        </div>
        <Link href="/citizen/new" className="btn">
          + Raise a complaint
        </Link>
      </div>

      {tickets && (
        <div className="stats">
          <div className="stat">
            <div className="value">{tickets.length}</div>
            <div className="label">Total</div>
          </div>
          <div className="stat">
            <div className="value">{active}</div>
            <div className="label">Still open</div>
          </div>
          <div className="stat green">
            <div className="value">{toConfirm}</div>
            <div className="label">Resolved - waiting for your confirmation</div>
          </div>
        </div>
      )}

      <div className="card">
        {tickets === null ? (
          <p className="muted">Loading...</p>
        ) : (
          <TicketTable tickets={tickets} showCreator={false} currentUserId={userId} />
        )}
      </div>
    </>
  );
}
