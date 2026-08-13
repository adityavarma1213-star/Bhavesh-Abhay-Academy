# Completion Pass — Learning Memory / Mistake Pattern Integrity

**Date:** 11 August 2026
**Scope:** audit of the remaining sync endpoints (Planner, Rewards, Teacher Notes, Learning Memory)
for the same client-trust pattern already fixed in Assessment and Homework Scanner.

## Audit results

| Endpoint | Finding | Action |
|---|---|---|
| `api/v1/rewards.js` | Already fully server-derived (XP/badges computed from real attempts/results; client can only append audit events with `xp` hardcoded to 0) | No change needed |
| `api/v1/planner.js` | Client-trusted, but correctly so — goals/tasks/preferences are the student's own self-managed to-do data, not a graded claim. Nothing here gates, scores, or feeds Learning Memory. | No change needed |
| `api/v1/teacher-notes.js` | Role-gated (teacher/admin only), author set from session not client, delete requires ownership match | No change needed |
| `api/v1/learning-memory.js` | **Client-trusted status/evidenceCount/correctCount for `learning_memory`, and full client-trusted `mistake_patterns`.** The table's own schema comment says it is "DERIVED... Recomputable from learning_evidence at any time" — the code didn't honor that. A forged `status: "mastered"` on any concept, or a hidden/forged mistake pattern, would have reached the exact table AI Mode, Planner, Tutor, and the Confidence Meter (M9/M10) are meant to read from. | **Fixed this pass.** |

## What changed
`api/v1/learning-memory.js` now recomputes `learning_memory` and `mistake_patterns` server-side from
`learning_evidence` (already server-verified via the Assessment fix) on every sync, using the exact
same thresholds as the client's own `updateLearningMemory()`/`updateMistakePatterns()` in
`js/baa-assessment.js`:

- `MIN_EVIDENCE_FOR_JUDGEMENT = 3`, `RECENT_WINDOW = 5`, `MASTERED_THRESHOLD = 0.8`,
  `LEARNING_THRESHOLD = 0.5`, `MISTAKE_PATTERN_THRESHOLD = 3`.
- The client's own `learningMemory`/`mistakePatterns` PUT body is accepted for backward
  compatibility but no longer written anywhere — it's simply ignored in favor of the derived result.
- `mistake_pattern_occurrences` (the explainability link table that was defined in the schema but
  never populated) is now written, so every pattern traces back to the specific evidence rows that
  produced it.

## Verification
- New `test/run-learning-memory-integrity-tests.js`: 6/6 PASS — exercises the exact derivation
  thresholds against known evidence sequences (insufficient evidence, mastered, needs_revision,
  exactly-at-threshold learning, and the 3-occurrence mistake-pattern promotion).
- Updated `test/run-g7-learning-memory-sync-tests.js`'s one regex assertion to match the new
  (still append-only, same intent) history-write condition.
- Full suite: **99/99 PASS**. JavaScript syntax: **211/211 PASS**.

## Known remaining gap (documented, not fixed this pass)
Homework Scanner's `learning_integration` field (per-submission weak-topic signals from
`api/evaluate-homework.js`, now token-verified as of the previous pass) is stored on the homework
submission for display/history but does not yet feed into `learning_evidence` / `learning_memory`.
The Blueprint's M8 description ("weak topics are sent into the student's revision evidence") implies
it should. This is a functional gap, not a security one — worth a dedicated checkpoint.

## Scope protection
No Blueprint/Roadmap module, section, or Permanent Scope Protection Rule was touched.
