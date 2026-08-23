-- BAA external-module persistence. Provider credentials remain outside source control.
-- M43 Scholarship Finder
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
CREATE INDEX IF NOT EXISTS idx_scholarships_public ON scholarships(status, deadline);

-- M45 Mentor Marketplace
CREATE TABLE IF NOT EXISTS mentor_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending','verified','rejected','suspended')),
  safeguarding_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (safeguarding_status IN ('not_configured','pending','verified','expired')),
  hourly_rate_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'INR',
  availability JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mentor_profiles_subjects ON mentor_profiles USING GIN(subjects);

CREATE TABLE IF NOT EXISTS mentor_requests (
  id TEXT PRIMARY KEY,
  mentor_id TEXT NOT NULL REFERENCES mentor_profiles(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','declined','cancelled','completed')),
  requested_start TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mentor_requests_learner ON mentor_requests(learner_id, created_at DESC);

-- M46 vendor-neutral School ERP configuration/sync state. Secrets are never stored here.
CREATE TABLE IF NOT EXISTS erp_connections (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  credential_ref TEXT,
  status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','configured','healthy','error','disabled')),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_erp_connections_owner ON erp_connections(owner_user_id);

CREATE TABLE IF NOT EXISTS erp_sync_runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES erp_connections(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('pull','push')),
  entity_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_changed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_erp_sync_runs_connection ON erp_sync_runs(connection_id, created_at DESC);
