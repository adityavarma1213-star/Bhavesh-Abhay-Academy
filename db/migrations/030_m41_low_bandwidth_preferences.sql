-- M41 authenticated learner low-bandwidth preference persistence.
-- This stores explicit data-saver preferences only; it does not claim true offline sync.
CREATE TABLE IF NOT EXISTS learner_low_bandwidth_preferences (
  learner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  content_mode TEXT NOT NULL DEFAULT 'auto' CHECK (content_mode IN ('auto','text','audio','lite')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
