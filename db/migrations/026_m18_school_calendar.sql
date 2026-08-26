-- M18 School Calendar Integration — learner-owned server calendar.
CREATE TABLE IF NOT EXISTS school_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('exam','deadline','holiday','school_event')),
  subject TEXT CHECK (subject IS NULL OR char_length(subject) <= 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_calendar_events_learner_date
  ON school_calendar_events(learner_id, event_date ASC);

CREATE INDEX IF NOT EXISTS idx_school_calendar_events_learner_type
  ON school_calendar_events(learner_id, event_type, event_date ASC);
