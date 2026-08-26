-- M48 safety hardening: server-side moderation state and reports.
ALTER TABLE collaboration_posts ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_state IN ('pending','approved','blocked'));
CREATE INDEX IF NOT EXISTS idx_collaboration_posts_moderation ON collaboration_posts(moderation_state,created_at DESC);
CREATE TABLE IF NOT EXISTS collaboration_reports (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES collaboration_posts(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_collaboration_reports_status ON collaboration_reports(status,created_at DESC);
