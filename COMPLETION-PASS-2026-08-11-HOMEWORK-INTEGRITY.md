# Completion Pass — Homework Scanner Grading Integrity

**Date:** 11 August 2026
**Scope:** closes the one gap flagged as "next checkpoint" in the Mastery Gate audit — the same
client-trust pattern found in Assessment grading also existed in Homework Scanner (M8) persistence.

## What was wrong
`api/v1/homework.js` wrote whatever `evaluation` JSON object the browser sent, unverified. A client
could submit weak homework, then sync a forged `evaluation.overallAssessment: "strong"` (or forged
`learningSignals`) — never touching Gemini at all — and it would be written straight into
`homework_submissions` and available to feed AI Learning Memory (M9) and the Confidence Meter (M10).

## What changed
- `api/_lib/assessment-verdict.js`: added `issueHomeworkVerdict` / `verifyHomeworkVerdict` /
  `hashHomeworkText` — the same signed-verdict pattern used for Assessment grading, adapted to what
  M8 actually produces (no numeric score; a qualitative `overallAssessment` + `learningSignals`).
  The verdict is bound to the exact `submissionId` **and** a hash of the exact text that was graded,
  so a token can't be replayed against a different (e.g. easier) submission.
- `api/evaluate-homework.js`: now requires `submissionId` in the request and returns a signed
  `verdictToken` alongside its result.
- `js/baa-homework.js`: passes `submissionId` when requesting evaluation and forwards the returned
  `verdictToken` in the locally-stored evaluation object.
- `api/v1/homework.js`: verifies the token against the submission id and the server-stored text
  before persisting `evaluation`/`learning_integration`. An evaluation with a missing or invalid
  token is never written; the submission is marked `pending_review` with an honest reason instead.

## Verification
- New `test/run-homework-integrity-tests.js`: 8/8 PASS — executes the real verdict functions,
  including forged-payload rejection, cross-submission replay rejection, and post-evaluation
  text-swap rejection.
- Independently re-verified outside the test suite: a forged "strong" claim riding on a real
  `needs_improvement` token is discarded server-side in favor of the signed verdict; a text swap
  after evaluation invalidates the token (`VERDICT_TEXT_MISMATCH`).
- Existing suites updated for the new required field: `test/run-m8-b1-tests.js` (B12 expected-fields
  assertion), `test/run-m8-c-hardening-tests.js` (VM sandbox import-stripping list).
- Full suite: **98/98 PASS**. JavaScript syntax: **210/210 PASS**.

## Scope protection
No Blueprint/Roadmap module, section, or Permanent Scope Protection Rule was touched. This is a
same-shape fix to a subsystem already covered by the Mastery Gate audit — not a new feature.

## Still pending (unchanged from prior passes)
Live PostgreSQL deployment, live Gemini verification, real payment/ERP/mentor/scholarship providers,
full offline sync, executed CI/CD/monitoring/DR, and full WCAG verification remain
deployment/provider-dependent and are not claimed as complete here.
