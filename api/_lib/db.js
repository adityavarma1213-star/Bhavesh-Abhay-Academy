// BAA production database boundary (G5).
// Provider-neutral PostgreSQL adapter. Requires POSTGRES_URL or
// POSTGRES_URL_NON_POOLING. The application never falls back to localStorage
// on server requests. The `postgres` driver works with Neon, Supabase,
// self-hosted PostgreSQL, or another PostgreSQL-compatible provider.
import postgres from 'postgres';

let client = null;
function getClient() {
  if (client) return client;
  const url = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    const err = new Error('Production database is not configured.');
    err.code = 'DATABASE_NOT_CONFIGURED';
    throw err;
  }
  client = postgres(url, { ssl: 'require', max: 1, idle_timeout: 20, connect_timeout: 10 });
  return client;
}

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

// Keep the existing tagged-template call sites stable while removing the
// Vercel-specific SDK dependency.
//
// The `postgres` driver returns a plain array, while existing BAA call sites
// expect `{ rows }`. Wrapping the result here keeps that boundary consistent.
export async function sql(strings, ...values) {
  const rows = await getClient()(strings, ...values);
  return { rows };
}
sql.query = async (text, values = []) => {
  const rows = await getClient().unsafe(text, values);
  return { rows };
};
