# SECTION E — BLUEPRINT GAP REGISTER

Legend: 🟢 IMPLEMENTED · 🟡 PARTIALLY IMPLEMENTED · 🔵 ARCHITECTURAL FOUNDATION ·
🟠 DEPENDENT ON FUTURE G4/G5/G6 · 🔴 NOT YET IMPLEMENTED

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Data inventory (what/why/who/retention) | 🟢 | `trust-privacy.html`, code-derived, not templated |
| 2 | Retention policy statement | 🟢 | Explicitly disclaims legal-compliance claims |
| 3 | Parental consent | 🔵 | Local acknowledgement only — a *foundation*, not verified consent |
| 4 | Auditability / activity log | 🔵 | Real, append-only, but not tamper-proof (no server) |
| 5 | Legal compliance (COPPA/GDPR/FERPA) | 🔴 | Explicitly NOT claimed anywhere; requires G4/G5/G6 |
| 6 | Explainability — concept states, trends, planner tasks | 🟢 | Pre-existing from Section C, reused unchanged |
| 7 | Explainability — assessment/evaluation decisions | 🟢 | Pre-existing from Section B, reused unchanged |
| 8 | Explainability — career recommendations | 🔴 | Feature does not exist anywhere in the codebase yet; correctly not fabricated |
| 9 | Explainability — "AI Guardian" alerts | 🔴 | Feature does not exist anywhere in the codebase yet; correctly not fabricated |
| 10 | Student/parent re-evaluation requests | 🟢 | `requestReevaluation()`, tested |
| 11 | Teacher override | 🟢 | Pre-existing, reused |
| 12 | Grading-change history/versioning | 🟢 | `decisionHistory[]` — this fixed a real bug (silent overwrite) |
| 13 | Preservation of original AI evaluation through appeals | 🟢 | Verified across multiple decision rounds |
| 14 | Healthy stopping points / break reminders | 🟢 | Session-level, dismissible, off-by-default control respected |
| 15 | No shame-based messaging | 🟢 | Centralized + tested against banned-phrase list |
| 16 | No dark patterns for engagement | 🟢 | Verified none exist; new reminder code follows the same rule (tested) |
| 17 | Data export | 🟢 | Real, live data, downloadable JSON |
| 18 | Fresh-start / archive | 🟢 | Preserves human review/appeal records by design (tested) |
| 19 | Scoped deletion (`this_app_only` / `everything`) | 🟢 | Client-side only — see #20 |
| 20 | Server-side / legally-enforceable deletion | 🟠 | Requires G4/G5 backend; this build has no server copy to purge |
| 21 | Protection of uploaded images | 🟢 | Verified never persisted (pre-existing in `js/image.js`, now documented) |
| 22 | Protection of voice/TTS audio | 🟢 | Verified never persisted (pre-existing in `api/speak.js`, now documented) |
| 23 | Production-secure storage / encryption at rest | 🔴 | Explicitly disclaimed; requires G4/G5/G6 |
| 24 | Page-level access gating for Trust & Privacy Center | 🔴 | Same boundary G3 already documented — no page in this app is access-gated yet; out of scope for E per the boundary rule (E is not G4) |
| 25 | Human-in-the-loop governance (uncertainty surfaced, human accountable) | 🟢 | Reused Section B/C patterns + fixed the silent-overwrite gap |
| 26 | Emotion + purpose design system application | 🟢 | Applied to existing UX; no separate feature built to "claim" it |

## Checkpoint E.2 — Home-screen data honesty labeling

The Gamification/Community/Career surfaces on `student-os.html` (streak,
level, coins, achievements, community feed, coding-lab stats, career
path) are pre-existing preview/demo UI, out of scope for Section E to
rebuild (see boundary list below). E.2 does not build real tracking for
any of them — that would be a Gamification/Community/Career-ecosystem
checkpoint, not E. Instead, each surface now honestly discloses itself
as preview/sample content via a visible `preview` tag or a
`preview-note` line, so nothing on the home screen implies real tracked
activity that doesn't exist yet. No stores, tests, or frozen checkpoints
were touched.

## Explicitly out of scope for Section E (per blueprint boundary)

Not touched, as instructed: Curriculum & Board Intelligence, Smart
Low-Bandwidth Learning, Multilingual Learning, Voice Learning Assistant
(beyond the existing TTS feature, which was only *audited*, not
extended), Interactive Virtual Labs, Gamification, School/Coaching
Management, AI Content Generator, Community/Collaboration, Career
ecosystem expansion, AI Attendance, any H section, G4/G5/G6/G7.

---
## G7 Checkpoint 1 — Planner real per-learner persistence (added by audit follow-up)

Status: DONE for Planner. Preferences, goals, upcoming assessments, and task
status/history now persist to the real per-learner Postgres tables
(`planner_preferences`, `planner_goals`, `planner_upcoming_assessments`,
`planner_tasks`, `planner_task_events`) instead of being trapped in one
browser's localStorage — verified with 88/88 passing tests (87 pre-existing
+ 1 new), including a 13-assertion mock-database functional test of the
sync endpoint's upsert/reconciliation logic run during development.

What changed:
- `api/auth/signup.js` — a new student account now gets a real `learners`
  row (previously: none did, so no valid `learnerId` ever existed for a
  signed-up student).
- `api/v1/my-learners.js` (new) — resolves which learner(s) a session may
  act as; self-heals a missing learner row for pre-existing accounts.
- `api/v1/planner.js` (new) — GET returns a learner's server snapshot,
  PUT syncs the client's local store (replace-set for goals/upcoming,
  upsert-never-delete for tasks, with a `planner_task_events` row recorded
  on every real status change).
- `js/baa-planner.js` — added `setSyncTarget`/`hydrateFromServer`;
  `save()` now also pushes a non-blocking background sync when a session
  has opted in. Off by default — zero behavior change for anonymous/local
  use, confirmed by the full existing test suite staying green.
- `student-os.html` — on load, resolves a logged-in session's learner and
  hydrates from the server.

What this does NOT yet do (separate checkpoints, see plan below):
- Task **generation** (`generateCandidates`) still runs entirely client-side
  against local Section B evidence — Section B (learning evidence/memory)
  is not itself wired to the DB yet, so the Planner's *recommendations*
  still only reflect one browser's mastery data even though its *storage*
  is now real. Wiring Section B is the natural next checkpoint.
- Homework evidence, rewards, and assessment-attempt persistence — same
  "real backend exists, nothing calls it" gap, not yet fixed.
- Parent/Teacher dashboards do not yet query this new per-learner data
  (they still read local browser storage) — that's the read side of the
  same problem and is next after Section B.
- Not integration-tested against a live Postgres (no DB credentials in
  this sandbox, same limitation noted previously) — verified instead via
  code review, the full regression suite, and a mock-database functional
  test.

---
## G7 Checkpoint 2 — Learning Memory (mastery) real per-learner persistence

Status: DONE for the derived mastery summary. `learning_memory` (per-concept
status: mastered/learning/needs_revision/insufficient_evidence),
`learning_memory_history` (append-only transitions), and `mistake_patterns`
(summary only) now sync to the real per-learner backend — verified with
89/89 passing tests (88 prior + 1 new), plus a 10-assertion mock-database
functional test run during development.

**Real blocker found and documented, not worked around**: raw per-question
evidence (`learning_evidence`) and `assessment_attempts` CANNOT be synced
yet. The schema's `learning_evidence` table has NOT NULL foreign keys to
`assessment_attempts`, `assessments`, and `questions` — and no assessment
content (the actual questions/assessments) is seeded into the database
anywhere in this codebase; it only ever exists in client-side JS data
files. Fixing this needs a real decision: either (a) seed real assessment
content server-side first (a content-migration task, separate from this
audit), or (b) relax those foreign keys (a schema change with real
tradeoffs). I did not make that call unilaterally — flagging it here for
you to decide before the next checkpoint touches it.

## Checkpoint 3 (Mentor/Scholarship/ERP/Olympiad/AI Council empty states) — investigated, not yet changed

Correction to the original audit: these five modules are not prominently
exposed on the student dashboard — they're reachable only via
`feature-map.html`, and `UI-REACHABILITY-MATRIX.json` already documents at
least Mentor Marketplace and AI Council honestly ("no live marketplace
claimed", "no invented reviewers"). The original "misleadingly presented"
characterization was too strong for at least these two. Still true: there's
no real mentor/scholarship/ERP/competition data behind any of them. Not
changed yet — needs a closer pass through `feature-map.html` and each
module's actual entry point before editing, to avoid duplicating messaging
that may already be honest in places.
