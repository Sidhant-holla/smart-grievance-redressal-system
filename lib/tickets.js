import { query } from './db';

// Loads a ticket from v_ticket_details if the user is allowed to see it,
// otherwise returns null.
//  - admin: every ticket
//  - staff / dept_head: tickets of their own department
//  - citizen: tickets they raised or supported
export async function loadTicketFor(user, ticketId) {
  const result = await query('SELECT * FROM v_ticket_details WHERE ticket_id = $1', [ticketId]);
  const ticket = result.rows[0];
  if (!ticket) return null;

  if (user.role === 'admin') return ticket;
  if (user.role === 'staff' || user.role === 'dept_head') {
    return ticket.dept_id === user.deptId ? ticket : null;
  }
  if (ticket.created_by === user.id) return ticket;
  const supported = await query('SELECT 1 FROM ticket_supporters WHERE ticket_id = $1 AND user_id = $2', [
    ticketId,
    user.id,
  ]);
  return supported.rowCount > 0 ? ticket : null;
}
