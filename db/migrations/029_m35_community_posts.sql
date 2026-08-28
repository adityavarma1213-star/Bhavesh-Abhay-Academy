-- M35 durable authenticated community posts.
-- This creates a bounded, authenticated server store; it does not claim
-- public-network, age-verification, or safeguarding completeness.
CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_community_posts_group_created ON community_posts(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author_created ON community_posts(author_user_id, created_at DESC);
