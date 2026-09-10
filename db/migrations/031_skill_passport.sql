-- BAA M76 — Board-to-Career + Skill Passport (Blueprint V3.2/V3.3).
-- "Do not make deterministic career claims from insufficient evidence...
-- Use verified evidence... [pathways] without dictating career choices."
--
-- Every mapping here is admin/teacher-curated data, never AI-inferred at
-- write time — a concept maps to a skill because a human said so, not
-- because a model guessed. The passport itself (the API layer) only ever
-- surfaces a skill when the learner has REAL mastered-concept evidence
-- for it, and pathways are always framed as informational, never as a
-- recommendation or prediction.

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS concept_skill_map (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (concept_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_concept_skill_map_concept ON concept_skill_map(concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_skill_map_skill ON concept_skill_map(skill_id);

-- Informational only — never a recommendation, never a prediction. The
-- API layer is what enforces the non-prescriptive framing; this table is
-- just the curated, human-authored fact "skill X relates to pathway Y."
CREATE TABLE IF NOT EXISTS career_pathways (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill_pathway_map (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  pathway_id TEXT NOT NULL REFERENCES career_pathways(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (skill_id, pathway_id)
);
CREATE INDEX IF NOT EXISTS idx_skill_pathway_map_skill ON skill_pathway_map(skill_id);
