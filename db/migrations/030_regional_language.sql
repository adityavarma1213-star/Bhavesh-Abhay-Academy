-- BAA M75 — Regional Language + Low-Bandwidth Expansion (Blueprint V3.2/V3.3, IB-11).
-- "Do not use naive translation as the only architecture." A translation
-- is its own governed object with its own verification gate — never
-- auto-generated and immediately trusted. The original question and its
-- translation(s) are linked but independently verifiable, so a bad
-- translation can be caught and marked needs_review without touching the
-- source question at all.

CREATE TABLE IF NOT EXISTS board_question_translations (
  id TEXT PRIMARY KEY,
  source_question_id TEXT NOT NULL REFERENCES board_questions(id) ON DELETE CASCADE,
  medium TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  translated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (verification_status IN ('pending_verification', 'verified', 'needs_review')),
  verified_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_question_id, medium)   -- one translation record per question per medium; corrections update it, they don't pile up duplicates
);
CREATE INDEX IF NOT EXISTS idx_board_question_translations_source ON board_question_translations(source_question_id);
CREATE INDEX IF NOT EXISTS idx_board_question_translations_medium ON board_question_translations(medium);
