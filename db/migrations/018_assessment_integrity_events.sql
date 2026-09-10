-- BAA: Module 42 — AI Safety & Anti-Cheating System.
-- Logs behavioral signals (tab-switch/focus-loss) during a timed
-- assessment attempt. Per the Blueprint's own M42 logic, this NEVER
-- auto-fails a result — it only flags an attempt for human review once
-- a threshold is crossed. A student can only log events against their
-- own attempt (enforced server-side via requireLearnerAccess, not just
-- role); a teacher/admin can read flagged attempts for their own
-- students only.
CREATE TABLE IF NOT EXISTS assessment_integrity_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integrity_events_attempt ON assessment_integrity_events(attempt_id);
CREATE INDEX IF NOT EXISTS idx_integrity_events_learner ON assessment_integrity_events(learner_id);

-- Reuses the existing review_status state machine on assessment_attempts
-- (already used by the appeals/review workflow — see M39 in the master
-- spec) rather than adding a second, competing "needs review" boolean.
-- An integrity flag transitions review_status to 'pending_review', same
-- as a student-initiated appeal would; flagged_reason distinguishes why.
ALTER TABLE assessment_attempts ADD COLUMN IF NOT EXISTS flagged_reason TEXT;
