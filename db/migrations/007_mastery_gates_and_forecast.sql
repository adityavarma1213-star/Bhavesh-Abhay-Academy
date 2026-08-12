-- BAA: Cross-cutting Mastery Gate + Parent Bypass + Academic Forecast
CREATE TABLE IF NOT EXISTS learning_progression_gates (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  chapter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','cleared')),
  red_count INTEGER NOT NULL DEFAULT 0,
  green_count INTEGER NOT NULL DEFAULT 0,
  last_assessment_id TEXT REFERENCES assessments(id) ON DELETE SET NULL,
  last_attempt_id TEXT REFERENCES assessment_attempts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (learner_id, subject, chapter)
);
CREATE INDEX IF NOT EXISTS idx_progression_gates_learner ON learning_progression_gates(learner_id);

CREATE TABLE IF NOT EXISTS learning_gate_findings (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  chapter TEXT NOT NULL,
  attempt_id TEXT NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  finding_key TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  finding_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'red' CHECK (status IN ('red','green')),
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  cleared_at TIMESTAMPTZ,
  UNIQUE (learner_id, subject, chapter, finding_key)
);
CREATE INDEX IF NOT EXISTS idx_gate_findings_learner_chapter ON learning_gate_findings(learner_id,subject,chapter,status);

CREATE TABLE IF NOT EXISTS learning_gate_bypasses (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  parent_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  chapter TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS idx_gate_bypasses_learner_chapter ON learning_gate_bypasses(learner_id,subject,chapter,created_at);

ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS finding_details JSONB NOT NULL DEFAULT '[]';
