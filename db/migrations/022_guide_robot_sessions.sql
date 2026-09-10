-- BAA: Module 63 — Guide Robot optional usage log.
-- Genuinely optional (see the master engineering spec, Part 9): the
-- guide's actual explainer content requires zero database table to
-- function. This exists only so the founder can see which topics get
-- opened during the private testing year — a fire-and-forget signal,
-- never required, never blocking.
CREATE TABLE IF NOT EXISTS guide_robot_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  topic_id TEXT NOT NULL,
  page TEXT,
  role_context TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guide_robot_sessions_topic ON guide_robot_sessions(topic_id);
