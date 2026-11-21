'use client';

import { useEffect, useState } from 'react';
import TicketBrowser from '@/components/TicketBrowser';

// All tickets for the admin. Passing departments adds the department filter to TicketBrowser.
export default function AdminTicketsPage() {
  const [departments, setDepartments] = useState(null);

  useEffect(() => {
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []));
  }, []);

  return (
    <>
      <h1>All Tickets</h1>
      <p className="subtitle">Every ticket in the system. Try the same search in keyword and semantic mode to compare.</p>
      {departments && <TicketBrowser departments={departments} />}
    </>
  );
}
