-- BAA M68 — Adaptive Practice + Remediation (Blueprint V3.2/V3.3, EX-05/EX-06/EX-07).
-- Flow: Evidence -> Mastery Gap -> Verified Question Selection -> Attempt
-- -> Mistake Classification -> Micro-concept -> Explanation -> Similar
-- Practice -> Re-test -> Mastery Update.
--
-- Honesty constraint from the blueprint ("do not rely only on AI-generated
-- guesses"): board_questions (migration 024) has no answer key or
-- explanation field, so there was no way to grade a practice attempt
-- without fabricating a judgment. This migration adds both as explicit,
-- nullable, teacher-authored fields — grading only happens where a real
-- answer key exists; everything else is left ungraded (NULL), not guessed.

ALTER TABLE board_questions ADD COLUMN IF NOT EXISTS correct_answer_text TEXT;
ALTER TABLE board_questions ADD COLUMN IF NOT EXISTS explanation_text TEXT;

-- Real, evidence-derived mastery per learner+concept — never set directly
-- by the API; only ever recomputed from actual graded practice_attempts.
CREATE TABLE IF NOT EXISTS concept_mastery (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  mastery_score NUMERIC,                    -- NULL until at least one graded attempt exists — insufficient evidence, not a fabricated 0
  status TEXT NOT NULL DEFAULT 'insufficient_evidence' CHECK (status IN ('insufficient_evidence', 'weak', 'developing', 'mastered')),
  last_practiced_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_concept_mastery_learner ON concept_mastery(learner_id);
CREATE INDEX IF NOT EXISTS idx_concept_mastery_status ON concept_mastery(status);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_learner ON practice_sessions(learner_id);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id TEXT PRIMARY KEY,
  practice_session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES board_questions(id) ON DELETE CASCADE,
  response_text TEXT,
  is_correct BOOLEAN,                       -- NULL = ungraded (no answer key, or not yet human-reviewed) — never fabricated
  graded_by TEXT NOT NULL DEFAULT 'ungraded' CHECK (graded_by IN ('ungraded', 'deterministic', 'human')),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (practice_session_id, question_id)  -- idempotent: resubmitting the same question in a session updates, never duplicates
);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_session ON practice_attempts(practice_session_id);

-- Real mistake classification storage. failure_type starts 'unclassified'
-- and is only ever set by an explicit human action (never inferred/guessed
-- by this pass's code) — the blueprint's mistake-intelligence categories
-- exist as valid values a teacher can choose, not as an auto-classifier.
CREATE TABLE IF NOT EXISTS mistake_records (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES board_questions(id) ON DELETE CASCADE,
  practice_attempt_id TEXT REFERENCES practice_attempts(id) ON DELETE SET NULL,
  failure_type TEXT NOT NULL DEFAULT 'unclassified' CHECK (failure_type IN ('conceptual', 'calculation', 'comprehension', 'application', 'careless', 'time_pressure', 'unclassified')),
  classified_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mistake_records_learner_concept ON mistake_records(learner_id, concept_id);
