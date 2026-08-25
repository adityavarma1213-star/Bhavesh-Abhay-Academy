CREATE TABLE IF NOT EXISTS parent_conversation_prompts (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  state TEXT NOT NULL,
  prompts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_conversation_parent_learner
  ON parent_conversation_prompts(parent_user_id, learner_id, created_at DESC);
