-- M48 project-level moderation state for safe public collaboration discovery.
ALTER TABLE collaboration_projects
  ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (moderation_state IN ('pending','approved','blocked'));
CREATE INDEX IF NOT EXISTS idx_collaboration_projects_moderation ON collaboration_projects(moderation_state, status, updated_at DESC, id DESC);
