-- BAA: Module 61 — One-Year Private Testing & Founder Lab.
-- A structured testing journal, not a research platform. Records a
-- hypothesis, the metric being watched, and dated notes — matching the
-- Blueprint's own boundary: "do not claim that the study occurred
-- before evidence exists." Admin-only (founder-only).
CREATE TABLE IF NOT EXISTS founder_lab_logs (
  id TEXT PRIMARY KEY,
  hypothesis TEXT NOT NULL,
  metric TEXT NOT NULL,
  notes TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_founder_lab_created ON founder_lab_logs(created_at);
