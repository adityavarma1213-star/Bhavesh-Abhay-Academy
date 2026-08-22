-- BAA: durable reward/XP summary for authenticated learners.
ALTER TABLE learner_rewards ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learner_rewards ADD COLUMN IF NOT EXISTS completed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learner_rewards ADD COLUMN IF NOT EXISTS answered_questions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learner_rewards ADD COLUMN IF NOT EXISTS correct_answers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learner_rewards ADD COLUMN IF NOT EXISTS mastered_concepts INTEGER NOT NULL DEFAULT 0;
