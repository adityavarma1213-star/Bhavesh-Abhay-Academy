-- BAA M55 — server-side account/data deletion.
-- Deletes learner-owned data first, then the account. All dependent
-- learner/user rows use FK cascades defined in the canonical schema.
-- This function is intentionally transactional: if any FK or validation
-- error occurs, PostgreSQL rolls back the entire deletion.

CREATE OR REPLACE FUNCTION baa_delete_user_account(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  learner_count INTEGER := 0;
  user_count INTEGER := 0;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'user id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user account not found' USING ERRCODE = 'P0002';
  END IF;

  -- A user-owned learner is the student's durable data owner. Deleting the
  -- learner first triggers the schema's ON DELETE CASCADE relationships for
  -- assessment, evidence, memory, planner, reward and other learner data.
  DELETE FROM learners WHERE user_id = p_user_id;
  GET DIAGNOSTICS learner_count = ROW_COUNT;

  -- User-owned relationships, credentials, sessions, consent, billing and
  -- entitlements cascade from users(id) according to the canonical schema.
  DELETE FROM users WHERE id = p_user_id;
  GET DIAGNOSTICS user_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', true,
    'userId', p_user_id,
    'learnerCount', learner_count,
    'userCount', user_count
  );
END;
$$;
