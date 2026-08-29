-- M31 authenticated learner language preference persistence.
-- Stores the student's explicit Tutor response-language choice only.
CREATE TABLE IF NOT EXISTS learner_language_preferences (
  learner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL DEFAULT 'en' CHECK (language_code IN ('en','hi','mr','gu','bn','ta','te','kn')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
