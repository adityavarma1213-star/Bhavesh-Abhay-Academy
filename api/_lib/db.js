// BAA production database boundary (G5).
// Node runtime only. Requires POSTGRES_URL (or POSTGRES_URL_NON_POOLING).
// The application never falls back to localStorage on server requests.
import { sql } from '@vercel/postgres';

export function dbConfigured() {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING);
}

export function requireDatabase() {
  if (!dbConfigured()) {
    const err = new Error('Production database is not configured.');
    err.code = 'DATABASE_NOT_CONFIGURED';
    throw err;
  }
  return sql;
}

export { sql };
