-- BAA M55 — server-side account deletion.
-- The function is intentionally transactional: PostgreSQL rolls back the
-- complete operation if any statement fails. It deletes account-owned
-- learner data through the canonical foreign-key cascade graph and removes
-- direct audit identifiers for the deleted account/learners.
BEGIN;

CREATE OR REPLACE FUNCTION baa_delete_user_account(target_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  learner_ids TEXT[];
  mentor_ids TEXT[];
  learner_count INTEGER := 0;
  mentor_count INTEGER := 0;
  user_count INTEGER := 0;
BEGIN
  IF target_user_id IS NULL OR btrim(target_user_id) = '' THEN
    RAISE EXCEPTION 'target_user_id is required' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id=target_user_id) THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found', 'learnerCount', 0);
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::TEXT[])
    INTO learner_ids
  FROM learners
  WHERE user_id=target_user_id;
  learner_count := COALESCE(array_length(learner_ids, 1), 0);

  SELECT COALESCE(array_agg(id), ARRAY[]::TEXT[])
    INTO mentor_ids
  FROM mentor_profiles
  WHERE user_id=target_user_id;
  mentor_count := COALESCE(array_length(mentor_ids, 1), 0);

  -- Remove audit rows that would otherwise retain the deleted account's
  -- direct identifiers. This is deliberately limited to account/learner/
  -- mentor entities; unrelated institutional audit history is preserved.
  DELETE FROM audit_log
  WHERE actor_user_id=target_user_id
     OR (entity_type='user' AND entity_id=target_user_id)
     OR (learner_count > 0 AND entity_type='learner' AND entity_id = ANY(learner_ids))
     OR (mentor_count > 0 AND entity_type='mentor_profile' AND entity_id = ANY(mentor_ids));

  -- mentor_profiles.user_id is SET NULL in the canonical schema, so remove
  -- account-owned mentor profiles explicitly before removing the user.
  IF mentor_count > 0 THEN
    DELETE FROM mentor_profiles WHERE id = ANY(mentor_ids);
  END IF;

  -- learners.user_id is SET NULL, so learner rows must be explicitly removed.
  -- Their assessment, evidence, planner, homework, reward, teacher-review,
  -- relationship and progression data cascade from the learner foreign key.
  IF learner_count > 0 THEN
    DELETE FROM learners WHERE id = ANY(learner_ids);
  END IF;

  DELETE FROM users WHERE id=target_user_id;
  GET DIAGNOSTICS user_count = ROW_COUNT;

  IF user_count <> 1 THEN
    RAISE EXCEPTION 'Account deletion removed an unexpected number of user rows' USING ERRCODE='P0001';
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'learnerCount', learner_count,
    'mentorCount', mentor_count
  );
END;
$$;

COMMIT;
