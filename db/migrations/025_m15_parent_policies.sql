-- M15 Parent Approval Mode — server-authoritative policy storage.
CREATE TABLE IF NOT EXISTS parent_ai_policies (
  learner_id UUID PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  tutor_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mentor_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  planner_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  planner_daily_minutes INTEGER NOT NULL DEFAULT 30 CHECK (planner_daily_minutes BETWEEN 0 AND 480),
  updated_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_ai_policies_updated_at
  ON parent_ai_policies(updated_at DESC);
