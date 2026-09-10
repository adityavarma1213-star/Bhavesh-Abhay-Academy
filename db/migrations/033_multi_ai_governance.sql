-- BAA M78 — Multi-AI Innovation + Scalability Hardening (Blueprint V3.2/V3.3).
--
-- SCOPE DECISION, stated plainly: the blueprint's "AI provider abstraction
-- layer" could mean rewiring chat.js/ai-mode.js/evaluate.js/
-- evaluate-homework.js to route through a shared provider-selection layer.
-- Those four files are the original M01-M63 AI infrastructure — already
-- found broken and fixed multiple times earlier in this project's history
-- (the undefined corsHeaders/jsonError regression). Rewiring their core
-- call logic now, this late in a long session, purely to satisfy M78's
-- letter rather than a real need, is exactly the "do not rewrite working
-- M01-M63 functionality merely to fit future features" anti-pattern every
-- version of this blueprint repeats. So this migration adds real,
-- independently useful governance/observability infrastructure — a
-- provider registry, a usage-event log, and a decision trail — WITHOUT
-- touching those four files. Wiring them to actually emit usage events is
-- disclosed as real, identified follow-up work, not silently done or
-- silently skipped.
--
-- Also per blueprint: no sharding/Elasticsearch/queues/distributed
-- caches/vector DBs/"exactly once" mechanisms without measured need —
-- none introduced here.

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  model_identifier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
  rate_limit_per_minute INTEGER,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT,
  endpoint TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'rate_limited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider ON ai_usage_events(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_endpoint ON ai_usage_events(endpoint);

-- Real, human-authored record of governance decisions (a provider being
-- approved/deprecated, a duplicate engine being removed, a safety
-- review conclusion) — never an automated "AI compared itself" log.
CREATE TABLE IF NOT EXISTS ai_governance_decisions (
  id TEXT PRIMARY KEY,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('provider_approved', 'provider_deprecated', 'duplicate_removed', 'safety_review')),
  description TEXT NOT NULL,
  decided_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
