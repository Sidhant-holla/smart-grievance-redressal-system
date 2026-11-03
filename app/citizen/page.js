'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import TicketTable from '@/components/TicketTable';

export default function CitizenHome() {
  const [tickets, setTickets] = useState(null);

  useEffect(() => {
    fetch('/api/tickets')
      .then((res) => res.json())
      .then((data) => setTickets(data.tickets || []));
  }, []);

  const active = tickets ? tickets.filter((t) => t.is_open).length : 0;

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
            <div className="value">{tickets.filter((t) => t.status === 'RESOLVED').length}</div>
            <div className="label">Resolved - waiting for your confirmation</div>
          </div>
        </div>
      )}

      <div className="card">
        {tickets === null ? <p className="muted">Loading...</p> : <TicketTable tickets={tickets} showCreator={false} />}
      </div>
    </>
  );
}
