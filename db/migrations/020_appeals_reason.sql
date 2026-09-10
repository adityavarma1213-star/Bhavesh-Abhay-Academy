-- BAA: Module 39 (AI Review & Appeal) + Module 59 (Human-in-the-Loop
-- Governance), merged per the master spec's Part 2 recommendation —
-- teacher_reviews already models exactly the "pending human review"
-- queue both modules need at the per-question level; it only lacked a
-- place to record the student's own stated reason for disputing a
-- result. No new table — this is deliberately a small, additive change.
ALTER TABLE teacher_reviews ADD COLUMN IF NOT EXISTS appeal_reason TEXT;
ALTER TABLE teacher_reviews ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
