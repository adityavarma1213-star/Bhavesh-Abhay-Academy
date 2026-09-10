-- BAA: Module 54 — Psychological Safety & Cognitive Recovery.
-- A deliberately narrow, explicit, student-initiated signal — never
-- inferred by any other module. Per the Blueprint's own M54 boundary,
-- this is a workload-recovery signal, not a diagnostic or clinical
-- tool. Only the student themself may write a row here.
-- Column name/scale (1-5, higher = more pressure) matches the
-- selfRatedPressure parameter already expected by the existing, already
-- -tested js/baa-cognitive-safety.js check() function — no translation
-- layer needed between storage and the logic that consumes it.
CREATE TABLE IF NOT EXISTS planner_energy_checkins (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  self_rated_pressure SMALLINT NOT NULL CHECK (self_rated_pressure BETWEEN 1 AND 5),
  self_reported_break_minutes SMALLINT NOT NULL DEFAULT 0 CHECK (self_reported_break_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, checkin_date)
);
CREATE INDEX IF NOT EXISTS idx_energy_checkins_learner ON planner_energy_checkins(learner_id);
