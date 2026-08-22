# BAA OS — Mastery Gate Audit Fixes

**Date:** 11 August 2026

This pass preserves the entire Blueprint, Master Plan, Roadmap V2.3 and all Permanent Scope Protection Rules. It adds no scope removals.

## Findings fixed

1. **Server-authoritative grading:** MCQ/True-False are re-graded from `questions.correct_answer`; AI results require a short-lived HMAC verdict token tied to the exact attempt/question. Client `isCorrect`, `correctness`, score and finding fields are not authoritative.
2. **Deep-link race:** `assessment.html` now exposes `window.BAA_READY` and waits for learner identity before starting an AI/Custom/Planner deep-linked assessment.
3. **Forecast scope:** chapter forecast no longer falls back to an unrelated overall score when there is no completed attempt for the exact chapter; it returns insufficient evidence instead.
4. **Warning tie-break:** exam-close caution explicitly wins when its <=14-day/<75% condition overlaps the general caution band.
5. **Evidence integrity:** authenticated assessment persistence now derives `learning_evidence` and attempt totals from server-verified assessment results rather than the client evidence/results payload. A unique `(attempt_id, question_id)` index prevents duplicate authoritative evidence rows.
6. **Regression test quality:** added behavior-level tests for deterministic grading, HMAC verdict issuance/verification, tamper rejection and replay rejection. Existing static tests remain, but this pass does not relabel them as runtime integration tests.

## Verification

- 96 top-level `test/run-*.js` suites: **96/96 PASS**
- JavaScript syntax: **206/206 PASS**
- New assessment-integrity behavioral tests: **7/7 PASS**
- Mastery runtime contract checks: **7/7 PASS**

## Remaining verification limitation

A live PostgreSQL instance and deployed Gemini environment were not available in this workspace, so this pass does not claim a production two-device/API integration test. The code is intentionally fail-closed when the verdict secret is absent.

## Permanent rule added

Any feature that gates, scores, unlocks, rewards or forecasts must derive its authoritative state server-side or from a server-issued signed verdict. Client-reported state may be retained for UI compatibility but must never be the authority.
