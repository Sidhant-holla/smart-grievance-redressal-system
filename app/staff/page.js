'use client';

import { useEffect, useState } from 'react';
import TicketBrowser from '@/components/TicketBrowser';

const TABS = [
  { value: 'mine', label: 'Assigned to me' },
  { value: 'unassigned', label: 'Unassigned queue' },
  { value: 'department', label: 'All department tickets' },
];

export default function StaffPage() {
  const [available, setAvailable] = useState(null);

  useEffect(() => {
    fetch('/api/staff/availability')
      .then((res) => res.json())
      .then((data) => setAvailable(data.isAvailable));
  }, []);

  async function toggleAvailability() {
    const next = !available;
    await fetch('/api/staff/availability', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: next }),
    });
    setAvailable(next);
  }

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Ticket Queue</h1>
          <p className="subtitle">Tickets of your department. Overdue tickets are highlighted.</p>
        </div>
        {available !== null && (
          <div className="row">
            <span className="muted">{available ? 'You are receiving new tickets' : 'Auto-assign is paused for you'}</span>
            <button className={available ? 'secondary' : ''} onClick={toggleAvailability}>
              {available ? 'Set unavailable' : 'Set available'}
            </button>
          </div>
        )}
      </div>

      <TicketBrowser tabs={TABS} />
    </>
  );
}
