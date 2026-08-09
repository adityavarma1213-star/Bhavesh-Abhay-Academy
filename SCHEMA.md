# BAA OS — Database Schema (Section G1)

Status: **design/foundation only**. No live database is connected to
this project. This document describes `db/schema.sql`, a relational
schema for BAA's future production data layer, and how it relates to
today's localStorage-based Sections A–D. See `MIGRATION-MAPPING.md`
for the localStorage → table mapping (design only — actual migration
is G5) and `js/data-access/README.md` for the data-access layer this
schema is paired with.

## 1. Entity list

**Identity / relationships** (foundation for G2/G3, not implemented by G1):
`users`, `user_roles`, `learners`, `parent_learner`, `teacher_learner`,
`classes`, `class_members`

**Learning profile:** `learning_profiles`

**Question bank / catalog:** `questions`, `assessments`, `assessment_questions`

**Assessment attempts:** `assessment_attempts`, `assessment_answers`,
`assessment_results`, `ai_evaluation_records`, `teacher_reviews`,
`teacher_notes`

**Learning evidence / memory / mistakes:** `learning_evidence`,
`learning_memory`, `learning_memory_history`, `mistake_patterns`,
`mistake_pattern_occurrences`

**Planner:** `planner_preferences`, `planner_goals`,
`planner_upcoming_assessments`, `planner_tasks`, `planner_task_events`

**Foundations:** `consent_preferences`, `audit_log`

Full column-level definitions, constraints, and comments are in
`db/schema.sql` — this document explains the *why*, not a duplicate
column list.

## 2. Ownership model

Every learner-specific record carries `learner_id` (directly, or via
an FK chain through `attempt_id` → `assessment_attempts.learner_id`).
There are no global, unowned rows for private learner data — see
requirement 5. `learning_evidence`, `assessment_attempts`,
`planner_tasks`, `mistake_patterns`, `teacher_notes`, and
`teacher_reviews` all have a direct `learner_id` column so a learner's
data can always be queried, exported, or deleted as one set.

## 3. Relationships supported

- One `user` → many `user_roles` (a user can be teacher *and* parent)
- One `parent` (user) → many `learners`, via `parent_learner`
- One `teacher` (user) → many `learners`, via `teacher_learner`
- One `learner` → many authorized adults, via the same two join tables
- One `class` → many `learners`, via `class_members`
- One `teacher` → many `classes`

No fake users, learners, or classes are created by G1 — only the
table structures (requirement 6/28).

## 4. Identifier strategy

Primary keys are `TEXT` using the same `uid(prefix)` format the
existing client code already generates (`js/baa-assessment.js`,
`js/baa-planner.js` — e.g. `attempt_<timestamp36>_<random6>`). This
means IDs already created client-side today remain valid unchanged if
they are ever written into these tables — no re-keying step is
required at migration time. Names, emails, and phone numbers are
never used as a primary key (requirement 16).

## 5. Source vs. derived data

**Source (never overwritten, always additive):**
`assessment_answers`, `assessment_results`, `ai_evaluation_records`,
`learning_evidence`, `teacher_reviews`, `teacher_notes`,
`planner_task_events`.

**Derived / cacheable (always recomputable from source):**
`learning_memory`, `learning_memory_history`, `mistake_patterns` +
`mistake_pattern_occurrences` (the pattern rows are derived, but each
one links back to real `learning_evidence` rows rather than only
storing an aggregate count, so they stay explainable — requirement
12).

This mirrors `js/baa-assessment.js` exactly: `evidence` is the
mirrored source list, and `updateLearningMemory()` /
`updateMistakePatterns()` are the derivation functions this schema's
derived tables are designed to eventually hold the *output* of — not
a second, independent source of truth.

## 6. Assessment data model

```
assessments → assessment_questions → questions
assessment_attempts → assessment_answers   (raw student input)
                    → assessment_results    (graded outcome)
                    → ai_evaluation_records (AI's own record, per question)
                    → teacher_reviews       (human decision, references the AI record)
                    → learning_evidence     (one row per answered question)
```

`assessment_attempts.attempt_number` plus a `UNIQUE (learner_id,
assessment_id, attempt_number)` constraint guarantees a new attempt
is always a new row — schema-level enforcement of requirement 8
("never design the schema so a new attempt overwrites an old
attempt"), matching `js/baa-assessment.js`'s `attemptNumber` counter.

## 7. AI evaluation vs. teacher decision

`ai_evaluation_records` and `teacher_reviews` are separate tables.
`teacher_reviews.ai_evaluation_id` references the record being
reviewed, but accepting/editing/rejecting only ever inserts/updates
the `teacher_reviews` row — it never mutates the AI's original
record (requirement 13, and matches `js/baa-assessment.js`'s comment
that the original AI evaluation is preserved even after a teacher
override).

## 8. Mistake Archaeology

`mistake_patterns` stores the aggregate (concept, error type, status),
but `mistake_pattern_occurrences` links each pattern to the specific
`learning_evidence` row that contributed to it. This means the system
can always answer "why do you think this is a pattern?" with real
evidence rows, not just a number (requirement 12).

## 9. Privacy & identifiers

No location, phone number, address, or family information fields
exist anywhere in this schema (requirement 15). `users.email` is the
only contact-adjacent field, and it is nullable — G1 does not require
an account to exist for a learner to have data.

## 10. Data lifecycle / soft delete

`users`, `learners`, `parent_learner`, `teacher_learner`, `classes`,
and `class_members` all have a `deactivated_at` / `revoked_at` /
`archived_at` / `removed_at` column rather than supporting hard
deletes at the schema level. Removing a relationship (e.g. a
teacher–learner link) sets `revoked_at`; it does not cascade-delete
the learner's historical educational records. Full deletion
workflows (e.g. for account closure / right-to-erasure requests)
are out of scope for G1 and belong to later G work (requirement 18).

## 11. Indexes

Indexes are added only where a query pattern from the existing app
requires them (requirement 19), not on every column:

| Index | Supports |
|---|---|
| `idx_evidence_learner`, `idx_evidence_learner_concept` | learner → evidence, learner → concept evidence (Learning Memory derivation) |
| `idx_attempts_learner`, `idx_attempts_assessment` | learner → attempts, assessment → attempts |
| `idx_planner_tasks_learner`, `idx_planner_tasks_learner_date` | learner → planner tasks, today's plan lookup |
| `idx_mistake_patterns_learner` | learner → mistake patterns |
| `idx_reviews_learner`, `idx_reviews_status` | learner → teacher reviews, review queue by status |
| `idx_teacher_notes_learner` | learner → teacher notes |
| `idx_planner_goals_learner`, `idx_planner_upcoming_learner` | learner → planner goals / upcoming assessments |
| `idx_questions_concept`, `idx_questions_subject_chapter` | question bank lookups mirroring `js/question-bank.js` access patterns |
| `idx_audit_entity`, `idx_audit_actor` | audit lookups (foundation for G6) |
| `idx_auth_sessions_user` | user → sessions (added in G2.1, see section 15) |

## 12. Database provider (requirement 20)

No provider is connected. `db/schema.sql` targets PostgreSQL because
it is available as a managed, HTTP/serverless-reachable service (e.g.
Neon, Supabase, Vercel Postgres) compatible with this project's
existing Vercel **Edge Function** architecture (`api/chat.js`,
`api/evaluate.js`, `api/speak.js` all run on `export const config =
{ runtime: 'edge' }`, which cannot open raw TCP connections — a
standard `pg` driver will not work there). G1 does not choose a
specific provider or driver; that decision, plus the actual connected
`DatabaseAdapter` implementation, belongs to G4.

## 13. LocalStorage mapping

See `MIGRATION-MAPPING.md` for the full table. In short:
`baa_section_b_data_v1` → attempts/answers/results/evidence/memory/
mistake-pattern/review tables; `baa_section_c_planner_v1` → planner
tables; `baa_section_d_teacher_notes_v1` → `teacher_notes`;
`baa_student_name` → `learners.display_name`.

## 14. What G1 does not do

- No authentication or authorization (G2/G3)
- No secure API layer or backend migration (G4)
- No actual localStorage → database migration (G5)
- No security/audit/backup implementation (G6)
- No live database connection, credentials, or provider selection
- No fake/seed production data

## 15. G2.1 addition — authentication schema (design only)

**Status: schema/design only, additive to G1.** Nothing else in this
document or in `db/schema.sql`'s G1-authored tables was changed to
add this section — see `db/schema.sql`'s own "1a. AUTHENTICATION
(Section G2.1)" comment block for the authoritative in-file notes.

G1 explicitly deferred authentication (section 14 above) and never
defined where a credential or a login session would live. G2.1 fills
only that specific, previously-undefined gap:

- **`credentials`** — one row per user, `password_hash` only (never
  a plaintext password), plus an `algorithm` column so a future
  hashing-scheme change doesn't require guessing what produced an
  existing hash.
- **`auth_sessions`** — one row per login session, `token_hash` only
  (never a raw token), with `expires_at` and a soft-delete-style
  `revoked_at` column, consistent with G1's existing lifecycle
  pattern (`deactivated_at`, `archived_at`, etc. elsewhere in this
  schema) rather than hard-deleting session rows.

**What G2.1 explicitly does not do** (left for later G2 checkpoints
or later G sections, per the G2 breakdown):

- No signup form, login form, or any UI (G2.3)
- No session-issuance or session-verification code (G2.3/G2.4)
- No password hashing actually performed anywhere (no algorithm is
  implemented — `algorithm` is just a recorded label)
- No repository/adapter changes — `js/data-access/` is untouched by
  G2.1 (that is G2.2)
- No real, network-verified secret storage — this project still has
  no live database connection or provider (G1 section 12; real
  credential security is a G4 concern)
- No authorization/role-enforcement logic (G3)
