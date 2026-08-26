-- BAA M48 — server-backed Global Student Collaboration
CREATE TABLE IF NOT EXISTS collaboration_projects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  region TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  minimum_age INTEGER NOT NULL DEFAULT 13 CHECK (minimum_age BETWEEN 0 AND 21),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','paused','completed','archived')),
  moderation_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS collaboration_participants (
  project_id TEXT NOT NULL REFERENCES collaboration_projects(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  moderation_state TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_state IN ('pending','approved','blocked')),
  joined_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (project_id, learner_id)
);

CREATE INDEX IF NOT EXISTS collaboration_projects_status_idx ON collaboration_projects(status, region);
CREATE INDEX IF NOT EXISTS collaboration_participants_learner_idx ON collaboration_participants(learner_id);
