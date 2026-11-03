// PostgreSQL connection pool. The connection string comes from the
// DATABASE_URL environment variable (.env.local), never from the code.
import { Pool } from 'pg';

// In development Next.js reloads modules on every change, so the pool is
// stored on `global` to avoid opening a new pool each time.
const pool = global.pgPool || new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') global.pgPool = pool;

export function query(text, params) {
  return pool.query(text, params);
}

// Runs fn(client) inside BEGIN ... COMMIT on a single connection.
// If anything throws, the whole transaction is rolled back.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
