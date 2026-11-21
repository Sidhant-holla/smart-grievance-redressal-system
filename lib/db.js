// PostgreSQL connection pool. The connection string comes from the
// DATABASE_URL environment variable (.env.local), never from the code.
import { Pool } from 'pg';

// In development Next.js reloads modules on every change, so the pool is
// stored on `global` to avoid opening a new pool each time.
// A pool keeps up to 10 database connections open and reuses them.
// Opening a new connection for every request would be slow.
const pool = global.pgPool || new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') global.pgPool = pool;

export function query(text, params) {
  return pool.query(text, params);
}

// Runs fn(client) inside BEGIN ... COMMIT on a single connection.
// If anything throws, the whole transaction is rolled back.
export async function withTransaction(fn) {
  // One connection is taken from the pool for the whole transaction,
  // because BEGIN, the queries and COMMIT must all run on the same connection.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Something failed, so undo everything done since BEGIN (all or nothing).
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Always give the connection back to the pool, even after an error.
    client.release();
  }
}
