-- M43 Scholarship Finder: verified first-party National Scholarship Portal seed.
-- This seed intentionally stores only facts verified from the official NSP portal
-- and links learners to the official source for current eligibility/award details.
-- The NSP portal distinguishes fresh/renewal timelines; BAA therefore does not
-- hard-code a single deadline for the general scheme record.
INSERT INTO scholarships (
  id, title, provider, country, level, fields, eligibility, amount_text,
  deadline, source_url, status, created_by
) VALUES (
  'nsp-pm-usp-csss-2026-27',
  'PM-USP – Central Sector Scheme of Scholarship for College and University Students (CSSS) — AY 2026-27',
  'National Scholarship Portal / Government of India',
  'India',
  'College / University',
  '["merit"]'::jsonb,
  '{"source":"National Scholarship Portal","academicYear":"2026-27","note":"Check the official NSP scheme specification and eligibility page before applying. NSP currently lists renewal timelines separately from fresh-application timelines."}'::jsonb,
  'See the official National Scholarship Portal for current award details.',
  NULL,
  'https://scholarships.gov.in/All-Scholarships',
  'published',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  provider = EXCLUDED.provider,
  country = EXCLUDED.country,
  level = EXCLUDED.level,
  fields = EXCLUDED.fields,
  eligibility = EXCLUDED.eligibility,
  amount_text = EXCLUDED.amount_text,
  deadline = EXCLUDED.deadline,
  source_url = EXCLUDED.source_url,
  status = EXCLUDED.status,
  updated_at = NOW();
