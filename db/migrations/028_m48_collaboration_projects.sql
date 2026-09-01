-- M48 production collaboration-project persistence.
-- Project state and membership live server-side; the browser cache is no longer the source of truth.
CREATE TABLE IF NOT EXISTS collaboration_projects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  region TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  minimum_age INTEGER NOT NULL DEFAULT 13 CHECK (minimum_age BETWEEN 13 AND 21),
  moderation_required BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','paused','completed','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_collaboration_projects_status ON collaboration_projects(status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_collaboration_projects_owner ON collaboration_projects(owner_user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS collaboration_project_participants (
  project_id TEXT NOT NULL REFERENCES collaboration_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  moderation_state TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_state IN ('pending','approved','blocked')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_collaboration_project_participants_user ON collaboration_project_participants(user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_collaboration_project_participants_moderation ON collaboration_project_participants(project_id, moderation_state, joined_at DESC);
