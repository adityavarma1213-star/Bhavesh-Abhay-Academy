-- M03 parental consent foundation.
-- This records an authenticated parent's consent decision for a learner they are
-- already linked to. It is NOT legal/compliance verification; external identity,
-- age/guardian verification, jurisdiction-specific consent and audit controls
-- remain production dependencies.
CREATE TABLE IF NOT EXISTS parental_consents (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  parent_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted','revoked')),
  consented_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (learner_id, parent_user_id),
  CHECK ((status='granted' AND consented_at IS NOT NULL AND revoked_at IS NULL)
      OR (status='revoked' AND revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_parental_consents_parent ON parental_consents(parent_user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_parental_consents_learner ON parental_consents(learner_id, status, updated_at DESC);
