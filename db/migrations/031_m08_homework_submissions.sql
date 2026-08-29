-- BAA M08 — durable learner homework submission snapshots.
-- Stores structured submission/evaluation metadata only; raw image/PDF bytes are not persisted.
CREATE TABLE IF NOT EXISTS homework_submissions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_homework_submissions_learner_submitted
  ON homework_submissions(learner_id, submitted_at DESC);
