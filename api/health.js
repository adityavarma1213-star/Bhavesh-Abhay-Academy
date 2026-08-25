// BAA production readiness endpoint (G5/G6 foundation).
// Reports only operational capability; it never exposes secrets or claims
// legal/compliance completion. A deployment is healthy only when the
// configured PostgreSQL boundary can actually execute a trivial query.
import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
  }

  const checkedAt = new Date().toISOString();
  const configured = Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING);

  if (!configured) {
    return json(res, 503, {
      ok: false,
      status: 'unavailable',
      checkedAt,
      dependencies: { database: { configured: false, status: 'unconfigured' } },
      releaseGate: { productionReady: false, note: 'Production database readiness is not verified.' },
    });
  }

  try {
    await sql`SELECT 1 AS ok`;
    return json(res, 200, {
      ok: true,
      status: 'healthy',
      checkedAt,
      dependencies: { database: { configured: true, status: 'ready' } },
      releaseGate: {
        productionReady: true,
        note: 'Database connectivity is verified for this request; legal, encryption, monitoring and provider acceptance remain separate gates.',
      },
    });
  } catch (_) {
    return json(res, 503, {
      ok: false,
      status: 'degraded',
      checkedAt,
      dependencies: { database: { configured: true, status: 'unavailable' } },
      releaseGate: { productionReady: false, note: 'Configured production database could not be verified for this request.' },
    });
  }
}
