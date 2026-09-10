-- BAA M65 — Curriculum + Paper Ingestion Foundation (Blueprint V3.2 IB-03/IB-04/IB-07).
-- Builds on M64's boards/academic_years (migration 023). Extensible across
-- any board registered there — nothing here hard-codes CBSE/CISCE or any
-- state board. M66 owns the searchable question-bank layer; this migration
-- only creates the canonical `board_questions` table as a foundation table
-- for it to build on, per the blueprint's explicit "M65 creates the
-- foundation, M66 owns the bank" split.
--
-- NAMING NOTE (found and fixed 2026-09-03, during M68 prep): a `questions`
-- table already exists in db/schema.sql, owned by the pre-existing M06
-- Smart Assessment System — it has a completely different, incompatible
-- structure (required `subject`/`chapter`/`topic`/`concept`/`type`/`text`
-- text columns, no board/curriculum-graph awareness at all). The original
-- version of this migration named the new board-aware canonical question
-- table `questions` too, which would have collided with — and, on a real
-- database, failed to correctly extend — that existing table (an `ALTER
-- TABLE ADD COLUMN` approach was tried first and also rejected, because
-- the real table's required NOT NULL columns like `subject`/`text`/`type`
-- have no defaults and are never populated by the new API, so every
-- INSERT would fail). This is a genuinely distinct entity from the M01–M63
-- statutory question bank, so it gets its own table name instead of
-- reusing or silently corrupting the existing one.

-- ---------- 1. Curriculum graph ----------
-- Board -> AcademicYear -> Class -> Subject -> Chapter -> Topic -> Concept -> LearningOutcome

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  academic_year_id TEXT REFERENCES academic_years(id) ON DELETE CASCADE,
  class_level TEXT NOT NULL,               -- e.g. 'Class 10', 'Class XII'
  medium TEXT NOT NULL,                    -- e.g. 'English', 'Hindi', 'Marathi'
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, class_level, medium, name)
);
CREATE INDEX IF NOT EXISTS idx_subjects_board ON subjects(board_id);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS idx_chapters_subject ON chapters(subject_id);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_topics_chapter ON topics(chapter_id);

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_concepts_topic ON concepts(topic_id);

CREATE TABLE IF NOT EXISTS learning_outcomes (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_concept ON learning_outcomes(concept_id);

-- ---------- 2. Textbook mapping (rights-gated) ----------

CREATE TABLE IF NOT EXISTS textbooks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  publisher TEXT,
  source_url TEXT,
  licence_type TEXT NOT NULL DEFAULT 'unknown' CHECK (licence_type IN ('unknown', 'open_licence', 'permitted_reference_only', 'restricted')),
  verification_status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (verification_status IN ('pending_verification', 'verified', 'needs_review')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_textbooks_board ON textbooks(board_id);

CREATE TABLE IF NOT EXISTS textbook_sections (
  id TEXT PRIMARY KEY,
  textbook_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  section_label TEXT NOT NULL,             -- e.g. 'Exercise 3.2'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_textbook_sections_textbook ON textbook_sections(textbook_id);

-- ---------- 3. Canonical paper metadata ----------

CREATE TABLE IF NOT EXISTS exam_papers (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  academic_year_id TEXT REFERENCES academic_years(id) ON DELETE SET NULL,
  exam_name TEXT NOT NULL,                 -- e.g. 'Board Final Exam', 'Pre-Board 1'
  session TEXT,                            -- e.g. 'March 2026'
  class_level TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  medium TEXT NOT NULL,
  source_url TEXT,
  licence_type TEXT NOT NULL DEFAULT 'unknown' CHECK (licence_type IN ('unknown', 'open_licence', 'permitted_reference_only', 'restricted')),
  verification_status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (verification_status IN ('pending_verification', 'verified', 'needs_review')),
  structure_json TEXT,                     -- sections/marks/timing once known; NULL until parsed
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'parsed', 'needs_review', 'verified', 'licence_check', 'approved', 'published', 'rejected', 'retired')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_papers_board ON exam_papers(board_id);
CREATE INDEX IF NOT EXISTS idx_exam_papers_status ON exam_papers(status);

-- ---------- 4. Canonical question foundation (M66 owns search/bank UX) ----------


-- This is a genuinely new, distinct entity from the pre-existing M06
-- `questions` table (db/schema.sql) — see the header comment above for why
-- it isn't reusing that name or altering that table.
CREATE TABLE IF NOT EXISTS board_questions (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  exam_paper_id TEXT REFERENCES exam_papers(id) ON DELETE SET NULL,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  class_level TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  medium TEXT NOT NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL,
  learning_outcome_id TEXT REFERENCES learning_outcomes(id) ON DELETE SET NULL,
  question_text TEXT,
  question_type TEXT CHECK (question_type IN ('mcq', 'short_answer', 'long_answer', 'numerical', 'diagram_based', 'unclassified')),
  marks NUMERIC,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard', 'unclassified')),
  bloom_level TEXT CHECK (bloom_level IN ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create', 'unclassified')),
  source_url TEXT,
  licence_type TEXT NOT NULL DEFAULT 'unknown' CHECK (licence_type IN ('unknown', 'open_licence', 'permitted_reference_only', 'restricted')),
  verification_status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (verification_status IN ('pending_verification', 'verified', 'needs_review')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'needs_review', 'verified', 'approved', 'published', 'rejected', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_questions_exam_paper ON board_questions(exam_paper_id);
CREATE INDEX IF NOT EXISTS idx_board_questions_concept ON board_questions(concept_id);
CREATE INDEX IF NOT EXISTS idx_board_questions_status ON board_questions(status);

-- ---------- 5. Ingestion pipeline + governance ----------

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY,
  exam_paper_id TEXT REFERENCES exam_papers(id) ON DELETE SET NULL,
  uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_hash TEXT NOT NULL,              -- SHA-256 of the uploaded bytes; drives idempotent dedup
  ocr_provider TEXT,                       -- NULL until an OCR attempt is made
  ocr_status TEXT NOT NULL DEFAULT 'not_attempted' CHECK (ocr_status IN ('not_attempted', 'not_configured', 'succeeded', 'failed')),
  ocr_result_text TEXT,
  error_code TEXT,
  error_message TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded', 'validated', 'rejected_validation', 'parsed', 'needs_manual_transcription',
    'needs_review', 'verified', 'licence_check', 'licence_rejected',
    'approved', 'published', 'retired'
  )),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_hash)                    -- idempotency: the same file uploaded twice is one job
);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_exam_paper ON ingestion_jobs(exam_paper_id);

CREATE TABLE IF NOT EXISTS ingestion_audit (
  id TEXT PRIMARY KEY,
  ingestion_job_id TEXT NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_audit_job ON ingestion_audit(ingestion_job_id);
