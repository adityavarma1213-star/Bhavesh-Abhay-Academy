-- BAA Module 51 — Challenge & Competition Arena production persistence.
BEGIN;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS grade_level TEXT;
CREATE TABLE IF NOT EXISTS challenge_matches (
  id TEXT PRIMARY KEY,
  challenger_learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  challenged_learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('xp_race','quiz_battle','streak_battle','weekly_xp','team_battle')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','completed','cancelled')),
  target_xp INTEGER NOT NULL DEFAULT 500 CHECK (target_xp >= 0),
  challenger_score NUMERIC NOT NULL DEFAULT 0,
  challenged_score NUMERIC NOT NULL DEFAULT 0,
  winner_learner_id TEXT REFERENCES learners(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CHECK (challenger_learner_id <> challenged_learner_id)
);
CREATE INDEX IF NOT EXISTS idx_challenge_challenger ON challenge_matches(challenger_learner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_challenge_challenged ON challenge_matches(challenged_learner_id,status,created_at DESC);
COMMIT;
