-- BAA M64 — India Board & Exam Registry.
-- Blueprint V3.2, IB-01/IB-02: an extensible registry for India State/UT
-- boards plus national/recognized boards, with official-source metadata,
-- verification state and academic-year/version framework. This migration
-- is registry-only (M64 scope) — curriculum graph (IB-03) is M65, question
-- bank (IB-05) is M66. No board is hard-coded into application logic;
-- everything an endpoint needs comes from these rows.

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,                      -- stable slug, e.g. 'cbse', 'cisce', 'mh-ssc'
  name TEXT NOT NULL,                       -- e.g. 'Central Board of Secondary Education'
  short_name TEXT NOT NULL,                 -- e.g. 'CBSE'
  board_type TEXT NOT NULL CHECK (board_type IN ('national', 'state_ut', 'international')),
  state_ut TEXT,                            -- e.g. 'Maharashtra'; NULL for national/international boards
  official_source_url TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (verification_status IN ('pending_verification', 'verified', 'needs_review')),
  verification_note TEXT,                   -- why it's at that status (e.g. "multiple lookalike domains found")
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_boards_type ON boards(board_type);
CREATE INDEX IF NOT EXISTS idx_boards_state_ut ON boards(state_ut);

CREATE TABLE IF NOT EXISTS academic_years (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  year_label TEXT NOT NULL,                 -- e.g. '2026-27'
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'upcoming')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, year_label)
);
CREATE INDEX IF NOT EXISTS idx_academic_years_board ON academic_years(board_id);

CREATE TABLE IF NOT EXISTS board_registry_audit (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'status_changed', 'verification_changed')),
  before_json TEXT,
  after_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_registry_audit_board ON board_registry_audit(board_id);

-- Seed: two boards independently verified against their official sites
-- during this session (search performed, not assumed). CBSE's domain is
-- unambiguous and is marked verified. CISCE has several confusingly
-- similar lookalike domains in search results (cisceboard.org,
-- cisceboardeducation.org, cisce-ac.in, cisce.online) alongside the
-- canonical cisce.org — exactly the kind of ambiguity IB-01's
-- verification_status field exists to flag, so it is seeded as
-- needs_review rather than verified, with the reason recorded.
-- No State/UT board is seeded yet — seeding one without the same
-- verification effort would be exactly the "hard-code one board and
-- call it India State Board support" anti-pattern the blueprint forbids.
INSERT INTO boards (id, name, short_name, board_type, state_ut, official_source_url, verification_status, verification_note)
VALUES
  ('cbse', 'Central Board of Secondary Education', 'CBSE', 'national', NULL, 'https://www.cbse.gov.in', 'verified', 'Confirmed via CBSE''s own site and independent reference sources during M64 build, 2026-09-02.'),
  ('cisce', 'Council for the Indian School Certificate Examinations', 'CISCE', 'national', NULL, 'https://www.cisce.org', 'needs_review', 'Multiple similarly-named domains exist (cisceboard.org, cisceboardeducation.org, cisce-ac.in, cisce.online); cisce.org is the best-supported candidate but needs a human reviewer to confirm before this board is used for anything provenance-sensitive.')
ON CONFLICT (id) DO NOTHING;
