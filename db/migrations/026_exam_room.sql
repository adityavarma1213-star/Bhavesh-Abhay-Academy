-- BAA M67 — Assessment & Exam Room (Blueprint V3.2/V3.3, EX-04/EX-09).
-- Server-authoritative exam state: the client never decides when time is
-- up, whether an attempt was submitted, or what the score is — every one
-- of those is computed/checked from this table on every request.

CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY,
  exam_paper_id TEXT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  time_limit_seconds INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_deadline_at TIMESTAMPTZ NOT NULL,      -- started_at + time_limit_seconds, computed server-side at start; authoritative
  submitted_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ,
  total_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'timed_out', 'evaluated', 'abandoned')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_learner ON exam_attempts(learner_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_paper ON exam_attempts(exam_paper_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_status ON exam_attempts(status);
-- A learner cannot have two attempts in progress on the same paper at
-- once — this is the actual duplicate-submission/duplicate-attempt guard,
-- enforced by the database, not just application logic. Multiple
-- completed/abandoned attempts on the same paper (retakes) remain allowed;
-- only a second *concurrent* in_progress attempt is blocked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_attempts_one_in_progress ON exam_attempts(exam_paper_id, learner_id) WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS exam_attempt_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES board_questions(id) ON DELETE CASCADE,
  response_text TEXT,
  marked_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  marks_awarded NUMERIC,
  version INTEGER NOT NULL DEFAULT 1,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)               -- one row per question per attempt; autosave upserts this, never duplicates it
);
CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_attempt ON exam_attempt_answers(attempt_id);

-- Append-only trail: every start/save/timeout/submit/evaluate event, so a
-- disputed or interrupted attempt (reconnect/recovery) has real evidence
-- of what happened and when, not just a final row.
CREATE TABLE IF NOT EXISTS exam_attempt_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('started', 'answer_saved', 'marked_for_review', 'reconnected', 'submitted', 'timed_out', 'abandoned', 'answer_scored', 'evaluated')),
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_attempt_events_attempt ON exam_attempt_events(attempt_id);
