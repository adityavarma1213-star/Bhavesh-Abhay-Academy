-- BAA Batch-D M46/M47 persistence extensions.
-- M46 provider-neutral ERP entity mapping keeps vendor identifiers separate from learner data.
CREATE TABLE IF NOT EXISTS erp_entity_mappings (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES erp_connections(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  local_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id, entity_type, local_id),
  UNIQUE(connection_id, entity_type, external_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_entity_mappings_external ON erp_entity_mappings(connection_id, entity_type, external_id);

-- M47 analytics indexes. No new source of truth is introduced; analytics remain derived from assessment evidence.
CREATE INDEX IF NOT EXISTS idx_class_members_class_learner ON class_members(class_id, learner_id);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_learner_status ON assessment_attempts(learner_id, status, end_time DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_results_attempt_question ON assessment_results(attempt_id, question_id);
