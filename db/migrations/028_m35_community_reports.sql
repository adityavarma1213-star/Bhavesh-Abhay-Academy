-- M35 community reporting foundation.
-- Reports are server-persisted moderation signals. They do not create a public
-- network or imply that identity/age/safeguarding controls are complete.
CREATE TABLE IF NOT EXISTS community_reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT,
  reported_text TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('safety','harassment','spam','other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_community_reports_status_created ON community_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_reports_reporter ON community_reports(reporter_user_id, created_at DESC);
