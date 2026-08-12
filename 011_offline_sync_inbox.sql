-- BAA M41 — durable offline operation inbox / idempotency ledger.
-- The client queue remains IndexedDB-backed, but queued writes carry a unique
-- operation id so the server can deduplicate retries and reject stale queued
-- snapshots instead of silently overwriting newer server state.
CREATE TABLE IF NOT EXISTS offline_sync_inbox (
  operation_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  operation_created_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','applied','rejected')),
  response JSONB,
  rejection_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offline_sync_learner_endpoint
  ON offline_sync_inbox(learner_id, endpoint, operation_created_at DESC);
