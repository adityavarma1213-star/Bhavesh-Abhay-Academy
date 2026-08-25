-- M48 collaboration visibility hardening.
-- Adds an explicit class scope so class-visible discussions are actually
-- discoverable by active class members instead of silently behaving as private.
ALTER TABLE collaboration_posts
  ADD COLUMN IF NOT EXISTS class_id TEXT REFERENCES classes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_collaboration_posts_class
  ON collaboration_posts(class_id, created_at DESC);

ALTER TABLE collaboration_posts
  DROP CONSTRAINT IF EXISTS collaboration_visibility_class_scope;

ALTER TABLE collaboration_posts
  ADD CONSTRAINT collaboration_visibility_class_scope
  CHECK ((visibility = 'class' AND class_id IS NOT NULL) OR visibility <> 'class');
