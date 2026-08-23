-- M12 AI Guardian acknowledgement persistence.
-- Alert computation remains academic-support-only; this table stores the user's
-- acknowledgement state server-side so it survives refresh/device changes.
CREATE TABLE IF NOT EXISTS guardian_alert_acknowledgements (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  alert_id TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (learner_id, alert_id)
);
CREATE INDEX IF NOT EXISTS idx_guardian_ack_learner ON guardian_alert_acknowledgements(learner_id, acknowledged_at DESC);
