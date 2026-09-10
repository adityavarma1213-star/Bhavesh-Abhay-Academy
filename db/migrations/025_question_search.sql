-- BAA M66 — Universal Question Bank + Search (Blueprint V3.2/V3.3, IB-05).
-- Builds on the `board_questions` table M65 already created (migration 024).
-- Per the blueprint: "Start with measured PostgreSQL capabilities; add a
-- dedicated search service only when scale/latency evidence requires it."
-- This adds exactly that — native Postgres full-text search — and nothing
-- heavier.

ALTER TABLE board_questions ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Filtering indexes for the facets the blueprint explicitly requires
-- (board, class, subject, chapter, topic, concept, exam, type, difficulty,
-- marks, source, verification). Several of these already exist from
-- migration 024 (exam_paper_id, concept_id, status); this adds the rest.
CREATE INDEX IF NOT EXISTS idx_board_questions_board_class ON board_questions(board_id, class_level);
CREATE INDEX IF NOT EXISTS idx_board_questions_subject ON board_questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_board_questions_chapter ON board_questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_board_questions_topic ON board_questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_board_questions_learning_outcome ON board_questions(learning_outcome_id);
CREATE INDEX IF NOT EXISTS idx_board_questions_type_difficulty ON board_questions(question_type, difficulty);
CREATE INDEX IF NOT EXISTS idx_board_questions_verification ON board_questions(verification_status);
CREATE INDEX IF NOT EXISTS idx_board_questions_search_vector ON board_questions USING GIN(search_vector);

-- Soft duplicate protection: the same exam paper should not accumulate two
-- rows for what is really the same question text. NULL exam_paper_id
-- (manually-authored practice questions not tied to a specific paper) is
-- exempt from this constraint, which is standard Postgres behavior for
-- unique indexes with NULL columns — each NULL is treated as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS uq_board_questions_paper_text ON board_questions(exam_paper_id, question_text) WHERE exam_paper_id IS NOT NULL;
