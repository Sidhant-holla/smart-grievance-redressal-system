// Small helpers shared by the API route handlers
import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth';

export function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Returns the user if they are logged in and have one of the given roles,
// otherwise returns an error response that the route should send back.
export async function requireRole(...roles) {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError('Please log in first', 401) };
  if (roles.length > 0 && !roles.includes(user.role)) {
    return { error: jsonError('You are not allowed to do this', 403) };
  }
  return { user };
}

// The embedding model is downloaded the first time it is used, so it can fail
// on a machine that has no internet yet.
export function embeddingError(err) {
  console.error('Embedding model failed:', err);
  return jsonError('The text similarity model could not be loaded. It needs internet the first time. Please try again.', 503);
}

// readable messages for the CHECK constraints in 01_schema.sql
const CHECK_MESSAGES = {
  chk_user_name: 'Name must be at least 2 characters',
  chk_user_email: 'Please enter a valid email address',
  chk_ticket_title: 'Title must be at least 5 characters',
  chk_ticket_description: 'Description must be at least 20 characters',
  chk_ticket_priority: 'Priority must be LOW, MEDIUM or HIGH',
  chk_rating_range: 'Rating must be between 1 and 5',
  chk_sla_hours: 'SLA must be between 1 and 720 hours',
  chk_comment_body: 'Comment must be between 1 and 2000 characters',
};

// Turns PostgreSQL errors into readable messages for the UI.
// Error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
export function dbError(err) {
  switch (err.code) {
    case 'P0001': // RAISE EXCEPTION from our triggers / procedures
      return jsonError(err.message, 409);
    case '23505': // unique_violation
      return jsonError('This record already exists', 409);
    case '23514': // check_violation
      return jsonError(CHECK_MESSAGES[err.constraint] || `Invalid data (rule ${err.constraint} failed)`, 400);
    case '23503': // foreign_key_violation
      return jsonError('Referenced record does not exist or is still in use', 400);
    default:
      console.error(err);
      return jsonError('Something went wrong on the server', 500);
  }
}
