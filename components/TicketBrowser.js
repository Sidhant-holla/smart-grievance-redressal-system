'use client';

import { useEffect, useState } from 'react';
import TicketTable from './TicketTable';

// Ticket list with tabs, status filter and keyword / semantic search.
// Used by the staff queue and the admin "All Tickets" page.
// Each useState below is one filter. Changing a filter reloads the list.
export default function TicketBrowser({ tabs, departments }) {
  const [scope, setScope] = useState(tabs ? tabs[0].value : '');
  const [status, setStatus] = useState('');
  const [deptId, setDeptId] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('keyword');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSearch, setActiveSearch] = useState('');

  // Builds the URL from the filters and calls GET /api/tickets, which builds the SQL.
  async function load(searchText = activeSearch) {
    setLoading(true);
    const params = new URLSearchParams();
    if (scope) params.set('scope', scope);
    if (status) params.set('status', status);
    if (deptId) params.set('deptId', deptId);
    if (searchText) {
      params.set('q', searchText);
      params.set('mode', mode);
    }
    const res = await fetch('/api/tickets?' + params.toString());
    const data = await res.json();
    setTickets(data.tickets || []);
    setLoading(false);
  }

  // Reload whenever the tab, status or department changes.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, status, deptId]);

  // Search only runs when the button is pressed, not on every keystroke.
  function onSearch(e) {
    e.preventDefault();
    setActiveSearch(search);
    load(search);
  }

  function clearSearch() {
    setSearch('');
    setActiveSearch('');
    load('');
  }

  return (
    <div className="card">
      {tabs && (
        <div className="tabs">
          {tabs.map((tab) => (
            <button key={tab.value} className={scope === tab.value ? 'active' : ''} onClick={() => setScope(tab.value)}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <form className="row" onSubmit={onSearch} style={{ marginBottom: 14 }}>
        <input
          className="inline-input"
          style={{ flex: 1, minWidth: 220 }}
          placeholder={mode === 'semantic' ? 'Describe the problem, e.g. "no internet in hostel"' : 'Search words in title / description'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="inline-input" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="keyword">Keyword search</option>
          <option value="semantic">Semantic search</option>
        </select>
        <button type="submit">Search</button>
        {activeSearch && (
          <button type="button" className="secondary" onClick={clearSearch}>
            Clear
          </button>
        )}
      </form>

      <div className="row" style={{ marginBottom: 14 }}>
        <select className="inline-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active (not resolved)</option>
          <option value="OPEN">Open</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="ESCALATED">Escalated</option>
          <option value="REOPENED">Reopened</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        {departments && (
          <select className="inline-input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.dept_id} value={d.dept_id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <span className="muted">{loading ? 'Loading...' : `${tickets.length} tickets`}</span>
      </div>

      {activeSearch && (
        <p className="muted">
          {mode === 'semantic'
            ? 'Semantic search ranks tickets by meaning (cosine similarity of embeddings), so different wording still matches.'
            : 'Keyword search uses PostgreSQL full-text search, so only tickets containing these words match.'}
        </p>
      )}

      {!loading && <TicketTable tickets={tickets} showDept={Boolean(departments)} showScore={Boolean(activeSearch)} />}
    </div>
  );
}
