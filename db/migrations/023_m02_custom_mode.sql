-- M02 Custom Mode server persistence.
CREATE TABLE IF NOT EXISTS custom_learning_paths (
  learner_id UUID PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  path JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_learning_paths_updated_at
  ON custom_learning_paths(updated_at DESC);
