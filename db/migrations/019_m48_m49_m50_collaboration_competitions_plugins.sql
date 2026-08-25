-- M48/M49/M50 additive persistence.
CREATE TABLE IF NOT EXISTS collaboration_posts (
  id TEXT PRIMARY KEY, author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT NOT NULL, subject TEXT, visibility TEXT NOT NULL DEFAULT 'global' CHECK (visibility IN ('global','class','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_collaboration_posts_created ON collaboration_posts(created_at DESC);
CREATE TABLE IF NOT EXISTS collaboration_comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES collaboration_posts(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_collaboration_comments_post ON collaboration_comments(post_id,created_at);
CREATE TABLE IF NOT EXISTS competition_events (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, organizer TEXT NOT NULL, subject TEXT, level TEXT,
  starts_at TIMESTAMPTZ, registration_url TEXT, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_competition_events_start ON competition_events(starts_at);
CREATE TABLE IF NOT EXISTS installed_plugins (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  entry_url TEXT NOT NULL, permissions JSONB NOT NULL DEFAULT '[]'::jsonb, enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(name,version)
);
