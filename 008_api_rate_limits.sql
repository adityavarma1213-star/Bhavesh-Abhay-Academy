-- Durable rate-limit state for authenticated AI endpoints.
-- key_hash is a SHA-256 digest of scope + caller identity; raw IP/session data is not stored.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_updated_at ON api_rate_limits(updated_at);
