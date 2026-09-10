-- BAA M69 — Learning Memory Integration (Blueprint V3.2/V3.3).
-- "Integrate board/exam learning into existing BAA Learning Memory...
-- Respect... evidence-gated integration... protects existing learning
-- intelligence from uncertain evidence."
--
-- The existing `learning_evidence` table (db/schema.sql) requires
-- attempt_id/assessment_id/question_id to be NOT NULL, all FK-bound to the
-- pre-existing M06 assessment system (assessment_attempts/assessments/
-- questions). Board-sourced evidence (from M67 exam_attempts or M68
-- practice_attempts) has no corresponding rows in those tables, so this
-- migration relaxes those three columns to nullable and adds a
-- provenance-tagged alternative path — while a CHECK constraint ensures
-- every row still satisfies ONE complete, valid provenance chain (legacy
-- or board-sourced), so this can never become a route to writing
-- evidence with no real source at all.
--
-- This does not touch how the existing M06 system reads or writes
-- evidence — every legacy INSERT already supplies all three columns, so
-- relaxing NOT NULL is backward compatible and changes no existing
-- behavior.

ALTER TABLE learning_evidence ALTER COLUMN attempt_id DROP NOT NULL;
ALTER TABLE learning_evidence ALTER COLUMN assessment_id DROP NOT NULL;
ALTER TABLE learning_evidence ALTER COLUMN question_id DROP NOT NULL;

ALTER TABLE learning_evidence ADD COLUMN IF NOT EXISTS board_question_id TEXT REFERENCES board_questions(id) ON DELETE SET NULL;
-- Polymorphic by design (a practice_attempts.id or an exam_attempts.id) —
-- no single FK target is possible without a third bridge table, which
-- would be more machinery than this integration point needs. Documented
-- here as a known, deliberate limitation rather than silently omitted:
-- this column's referential integrity is enforced by application code
-- (api/v1/[...route].js's learning-memory-integration.js), not the database.
ALTER TABLE learning_evidence ADD COLUMN IF NOT EXISTS source_attempt_id TEXT;

-- Every row must have ONE complete, valid provenance chain — legacy
-- (all three old FKs populated) or board-sourced (board_question_id
-- populated). This is what stops "evidence with no real source" from ever
-- being possible, regardless of which code path inserts it.
ALTER TABLE learning_evidence ADD CONSTRAINT chk_learning_evidence_provenance CHECK (
  (attempt_id IS NOT NULL AND assessment_id IS NOT NULL AND question_id IS NOT NULL)
  OR (board_question_id IS NOT NULL)
);
