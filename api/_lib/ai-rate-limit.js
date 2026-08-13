// Durable, database-backed AI rate limiter.
// Unlike an in-memory Map, this survives serverless instance changes.
import crypto from 'node:crypto';
import { sql } from './db.js';

export function rateLimitKey(scope, identity) {
  const raw = `${scope}:${String(identity || 'unknown')}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function consumeAiRateLimit(scope, identity, { windowSeconds = 300, maxRequests = 20 } = {}) {
  const key = rateLimitKey(scope, identity);
  const result = await sql`
    INSERT INTO api_rate_limits (key_hash, window_started_at, request_count, updated_at)
    VALUES (${key}, NOW(), 1, NOW())
    ON CONFLICT (key_hash) DO UPDATE
      SET window_started_at = CASE
            WHEN api_rate_limits.window_started_at <= NOW() - (${windowSeconds} * INTERVAL '1 second')
            THEN NOW() ELSE api_rate_limits.window_started_at END,
          request_count = CASE
            WHEN api_rate_limits.window_started_at <= NOW() - (${windowSeconds} * INTERVAL '1 second')
            THEN 1 ELSE api_rate_limits.request_count + 1 END,
          updated_at = NOW()
    RETURNING request_count, window_started_at
  `;
  const row = result.rows[0];
  const limited = Number(row?.request_count || 0) > maxRequests;
  return { limited, count: Number(row?.request_count || 0), windowStartedAt: row?.window_started_at || null };
}

export async function pruneAiRateLimits(maxAgeHours = 24) {
  await sql`DELETE FROM api_rate_limits WHERE updated_at < NOW() - (${maxAgeHours} * INTERVAL '1 hour')`;
}
