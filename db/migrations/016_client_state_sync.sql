-- BAA: generic per-learner client-state sync.
-- Several modules (Custom/Hybrid Mode preferences, Parent Approval policy,
-- School Calendar entries, Learning Resources format preference)
-- previously stored their entire state only in the browser's localStorage
-- — invisible to a parent/teacher on another device and lost if the
-- browser storage is cleared. Rather than a bespoke table per module
-- (each of these is a single small JSON blob, not relational data),
-- this table gives each of them real, per-learner server persistence
-- through one shared, narrow contract:
--   state_key  — a fixed, known string identifying which module owns the row
--                ('custom_mode_v1' | 'hybrid_mode_v1' | 'parent_approval_v1' |
--                 'school_calendar_v1' | 'learning_resources_v1')
--   state_value — the module's own JSON shape, opaque to the server
-- This mirrors the existing offline_sync_inbox precedent already in this
-- codebase (a generic envelope around module-specific payloads).
CREATE TABLE IF NOT EXISTS client_state (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  state_key TEXT NOT NULL,
  state_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (learner_id, state_key)
);
CREATE INDEX IF NOT EXISTS idx_client_state_learner ON client_state(learner_id);
