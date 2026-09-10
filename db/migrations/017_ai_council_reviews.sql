-- BAA: Module 62 — AI Council review records.
-- Was previously an orphaned, in-memory-only pure-function module
-- (js/baa-ai-council.js) never called from any page — reviews vanished
-- on page reload and there was no way for an admin to actually create or
-- see one. This table gives the same validated logic (createReview /
-- addResponse / consensus, unchanged) real, durable, admin-only storage.
CREATE TABLE IF NOT EXISTS ai_council_reviews (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  reviewers JSONB NOT NULL DEFAULT '[]'::jsonb,
  responses JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'awaiting_reviews',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_council_status ON ai_council_reviews(status);
CREATE INDEX IF NOT EXISTS idx_ai_council_created ON ai_council_reviews(created_at);
