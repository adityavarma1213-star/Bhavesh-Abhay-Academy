-- BAA M52: support bounded, cursor-ordered mistake archaeology reads.
-- The M52 API scans incorrect/partially-correct evidence by learner and
-- optionally narrows by subject/chapter, ordered newest-first. Keep the
-- access path aligned with that query shape so raw evidence persistence
-- remains usable as the evidence history grows.
CREATE INDEX IF NOT EXISTS idx_learning_evidence_m52_learner_created_id
  ON learning_evidence(learner_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_learning_evidence_m52_learner_subject_chapter_created_id
  ON learning_evidence(learner_id, subject, chapter, created_at DESC, id DESC);
