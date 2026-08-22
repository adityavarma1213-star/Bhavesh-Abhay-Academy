# BAA OS — LocalStorage → Database Migration Mapping (Design Only)

Status: **documentation only**. This describes how each existing
localStorage key would eventually map onto `db/schema.sql` tables. No
migration runs today. Actual migration is Section G5's job, per the
G1 brief (requirement 21).

## `baa_student_name`

| localStorage | Table.column |
|---|---|
| the raw name string | `learners.display_name` |

A `learners.id` does not exist yet client-side (single-learner-per-
browser today). G5 would need to mint one `learners` row per browser/
account the first time it migrates a browser's data.

## `baa_section_b_data_v1` (`js/baa-assessment.js`)

| localStorage field | Table.column |
|---|---|
| `attempts[].id/assessmentId/attemptNumber/startTime/endTime/status/evaluationStatus/reviewStatus/score/maxScore` | `assessment_attempts` (one row per attempt) |
| `attempts[].answers{questionId: answer}` | `assessment_answers` (one row per question answered) |
| `attempts[].questionResults[]` | `assessment_results` (one row per graded question) — AI-graded rows also produce an `ai_evaluation_records` row |
| `evidence[]` | `learning_evidence` (1:1, same rows) |
| `learningMemory{concept: {...}}` | `learning_memory` (one row per concept) — DERIVED; could equally be recomputed from `learning_evidence` instead of copied |
| `learningMemory[concept].history[]` | `learning_memory_history` |
| `mistakePatterns[]` | `mistake_patterns` (aggregate fields) |
| `mistakePatterns[].occurrences[]` | `mistake_pattern_occurrences` — each occurrence's `attemptId`+`questionId` is matched back to its `learning_evidence.id` at migration time (see `js/data-access/repositories/evidenceRepository.js` for the same match logic already implemented for reads) |
| `teacherReviews[]` | `teacher_reviews`, plus each row's embedded `aiEvaluation` object → its own `ai_evaluation_records` row |

## `baa_section_c_planner_v1` (`js/baa-planner.js`)

| localStorage field | Table.column |
|---|---|
| `preferences.availableMinutesPerDay` | `planner_preferences.available_minutes_per_day` |
| `goals[]` | `planner_goals` |
| `upcomingAssessments[]` | `planner_upcoming_assessments` |
| `tasks[]` | `planner_tasks` |
| `tasks[].history[]` | `planner_task_events` |

## `baa_section_d_teacher_notes_v1` (`teacher-os.html`)

| localStorage field | Table.column |
|---|---|
| `{id, text, createdAt}[]` | `teacher_notes` (`author_user_id` left null — Section D has no author field today; would need G2 accounts to populate) |

## Question bank (`js/question-bank.js`, code — not localStorage)

The question bank is currently a static JS array shipped with the
app, not user data. It maps directly onto `questions` /
`assessments` / `assessment_questions` and would most likely be
seeded once from the existing file rather than "migrated" from a
user's browser.

## What is intentionally NOT migrated by this design

- No fabricated `learners`, `users`, `parent_learner`, or
  `teacher_learner` rows — those require real accounts (G2) and real
  relationships, not something inferable from a single browser's
  localStorage.
- No `consent_preferences` or `audit_log` rows — nothing in
  Sections A–D currently produces this data to migrate.
