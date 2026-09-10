-- BAA M77 — Content Governance & Certification (Blueprint V3.2/V3.3).
-- Most governance primitives already exist per-content-type from M65-M76:
-- board_questions/exam_papers/board_question_translations all carry
-- source, licence_type, verification_status, status, version; ingestion
-- has its own full state machine + ingestion_audit. What's genuinely
-- missing is (a) a formal, cross-content CERTIFICATION attestation —
-- distinct from "verified" (someone checked correctness): certification
-- is an explicit admin sign-off that content meets governance standards
-- for real use, logged permanently — and (b) a single place to see what
-- still needs review across every content type, instead of checking four
-- different endpoints by hand.

CREATE TABLE IF NOT EXISTS certification_events (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('board_question', 'exam_paper', 'board_question_translation')),
  content_id TEXT NOT NULL,          -- polymorphic by design (one of three possible source tables); referential integrity for this is enforced in application code (api/v1/[...route].js content-governance.js), the same documented limitation as M69's source_attempt_id
  certified_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_certification_events_content ON certification_events(content_type, content_id);
