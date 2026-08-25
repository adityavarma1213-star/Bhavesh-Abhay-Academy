-- M43 Scholarship Finder persistence.
CREATE TABLE IF NOT EXISTS scholarships (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  country TEXT,
  level TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  eligibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount_text TEXT,
  deadline DATE,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS scholarships_status_deadline_idx ON scholarships(status, deadline);
CREATE INDEX IF NOT EXISTS scholarships_country_level_idx ON scholarships(country, level);
CREATE INDEX IF NOT EXISTS scholarships_fields_gin_idx ON scholarships USING GIN(fields);
