-- M03 Hybrid Mode server persistence.
CREATE TABLE IF NOT EXISTS hybrid_learning_paths (
  learner_id UUID PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  path JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hybrid_learning_paths_updated_at
  ON hybrid_learning_paths(updated_at DESC);
