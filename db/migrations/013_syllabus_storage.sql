-- BAA M40 / Academic Management — server-backed syllabus storage.
-- Metadata and chunked file bytes are scoped to the authenticated teacher who uploads them.
-- Chunking avoids large single-request uploads and keeps the browser from being the system of record.
CREATE TABLE IF NOT EXISTS syllabus_uploads (
  id UUID PRIMARY KEY,
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board TEXT NOT NULL,
  grade TEXT NOT NULL,
  subject TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS syllabus_file_chunks (
  upload_id UUID NOT NULL REFERENCES syllabus_uploads(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (upload_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_syllabus_uploads_teacher_status
  ON syllabus_uploads(teacher_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_syllabus_uploads_catalog
  ON syllabus_uploads(board, grade, subject, academic_year, status);
