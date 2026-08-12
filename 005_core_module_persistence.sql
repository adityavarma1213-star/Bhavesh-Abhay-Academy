-- BAA core authenticated persistence: Homework + Rewards.
CREATE TABLE IF NOT EXISTS homework_submissions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL,
  input_type TEXT NOT NULL,
  text TEXT NOT NULL,
  subject_hint TEXT,
  attachments JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  evaluation JSONB,
  last_evaluation_error TEXT,
  learning_integration JSONB,
  review JSONB,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_homework_learner ON homework_submissions(learner_id);

CREATE TABLE IF NOT EXISTS learner_rewards (
  learner_id TEXT PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  earned_badge_ids JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_events (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source_id TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_events_learner ON reward_events(learner_id,created_at);
