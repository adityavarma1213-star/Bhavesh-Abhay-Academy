-- BAA integrity hardening: one authoritative evidence row per assessment answer.
-- Existing duplicate rows are collapsed by keeping the newest row before the unique index.
DELETE FROM learning_evidence le
WHERE le.id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY attempt_id, question_id ORDER BY created_at DESC, id DESC) AS rn
    FROM learning_evidence
  ) d WHERE d.rn > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_evidence_attempt_question
  ON learning_evidence(attempt_id, question_id);
