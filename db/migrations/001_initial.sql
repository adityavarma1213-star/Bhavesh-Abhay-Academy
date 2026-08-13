-- BAA G5 production migration entrypoint.
-- Apply db/schema.sql first; this migration adds production-only hardening.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users ((lower(email)));
CREATE INDEX IF NOT EXISTS idx_sessions_active ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_created_at ON learning_evidence(created_at);
ALTER TABLE users ADD CONSTRAINT users_email_lower_check CHECK (email IS NULL OR email = lower(email));
COMMIT;
