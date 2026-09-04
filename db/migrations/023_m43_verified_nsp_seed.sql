-- M43 Scholarship Finder: verified first-party National Scholarship Portal seed.
-- This seed intentionally stores only facts verified from the official NSP portal
-- and links learners to the official source for current eligibility/award details.
-- It does not invent amounts, eligibility thresholds, or deadlines.
INSERT INTO scholarships (
  id, title, provider, country, level, fields, eligibility, amount_text,
  deadline, source_url, status, created_by
) VALUES (
  'nsp-pm-usp-csss-2026-27',
  'PM-USP – Central Sector Scheme of Scholarship for College and University Students (CSSS)',
  'National Scholarship Portal / Government of India',
  'India',
  'College / University',
  '["merit"]'::jsonb,
  '{"source":"National Scholarship Portal","academicYear":"2026-27","note":"Check the official NSP eligibility page before applying."}'::jsonb,
  'See the official National Scholarship Portal for current award details.',
  '2026-10-31',
  'https://scholarships.gov.in/Students',
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
