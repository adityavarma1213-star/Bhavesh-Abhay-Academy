-- BAA M71 — Adaptive Mock Examination (Blueprint V3.2/V3.3).
-- "Mocks must not contaminate official assessment records unless
-- explicitly designed to do so" + "Adaptive difficulty must be
-- deterministic/auditable enough to explain why questions were selected."
--
-- Design note: board_questions.exam_paper_id (migration 024) is a single
-- FK — one question belongs to exactly one paper. A mock exam needs to
-- assemble a NEW paper out of EXISTING, already-verified questions
-- without duplicating those question rows or reassigning their original
-- exam_paper_id (which would corrupt the source paper's real composition).
-- So mocks get a genuine many-to-many bridge table instead.

ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS paper_type TEXT NOT NULL DEFAULT 'official' CHECK (paper_type IN ('official', 'mock'));
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS generated_for_learner_id TEXT REFERENCES learners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_exam_papers_type ON exam_papers(paper_type);
CREATE INDEX IF NOT EXISTS idx_exam_papers_generated_for ON exam_papers(generated_for_learner_id);

-- The auditable "why was this question selected" record IS this
-- composition table — selection_reason is not a log kept alongside the
-- data, it's part of the data itself.
CREATE TABLE IF NOT EXISTS mock_exam_questions (
  id TEXT PRIMARY KEY,
  exam_paper_id TEXT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  board_question_id TEXT NOT NULL REFERENCES board_questions(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  selection_reason TEXT NOT NULL CHECK (selection_reason IN ('weak_concept', 'insufficient_evidence_concept', 'coverage_gap')),
  concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_paper_id, board_question_id)   -- a mock cannot include the same question twice
);
CREATE INDEX IF NOT EXISTS idx_mock_exam_questions_paper ON mock_exam_questions(exam_paper_id);
