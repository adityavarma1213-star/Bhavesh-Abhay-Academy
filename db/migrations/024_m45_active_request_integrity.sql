-- M45 Mentor Marketplace integrity: prevent concurrent duplicate active
-- requests for the same mentor/learner pair. Historical terminal requests
-- remain allowed; only requested/accepted rows participate in this index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mentor_requests_active_pair
  ON mentor_requests(mentor_id, learner_id)
  WHERE status IN ('requested', 'accepted');
