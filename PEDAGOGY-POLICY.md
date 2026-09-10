# BAA — Learning Science & Pedagogy Framework (Module 51)

**Status:** Foundation module — a documented policy plus a real compliance audit, not a runtime feature. Per the master engineering specification's Part 16 boundary decision: the Blueprint itself describes M51 as something "operationalized as product policies," not a screen a user opens. Building a live "pedagogy dashboard" would be inventing scope the Blueprint doesn't ask for.

**Source of the policy itself:** `js/baa-pedagogy.js`'s `POLICY` object (unmodified — this document does not redefine the policy, it documents and audits the one that already exists in code).

---

## The policy

```
productiveStruggle: true          — a student attempts before being shown the answer
showWorkedExampleAfterAttempt: true — explanation/model answer appear after grading, not before
spacedReview: true                — review intervals grow over time rather than staying fixed
masteryRequiresEvidence: true     — a status judgment requires a real evidence floor, not one lucky attempt
avoidShameLanguage: true          — no blame-framed or pressuring copy
```

`js/baa-pedagogy.js` also exposes `chooseAction(state)`, mapping a real `learning_memory` status to a pedagogical action: `needs_revision`/`struggling` → guided reteach, `learning` → retrieval practice, `mastered`/`strong` → extension, anything else → evidence building. This is the same status vocabulary M09/M17/M52/M58 already use — one consistent mapping, not a parallel one.

---

## Compliance audit — checked against the real, currently-shipped code, not assumed

| Policy rule | Where it's enforced | Verified how | Result |
|---|---|---|---|
| `productiveStruggle` / `showWorkedExampleAfterAttempt` | `assessment.html`'s `renderResults()` | Grepped every appearance of `model_answer`/`explanation`/`correctAnswer` in `assessment.html` — both occurrences are inside `renderResults()`, which only executes after an attempt is submitted and graded. No earlier code path reveals the answer during an active attempt. | ✅ Complies |
| `masteryRequiresEvidence` | `api/v1/[...route].js`, the `learning_memory` derivation | Real constants confirmed in source: `MIN_EVIDENCE_FOR_JUDGEMENT = 3`, `MASTERED_THRESHOLD = 0.8`. A concept cannot be judged `mastered`/`needs_revision` from a single attempt — the evidence floor is a real, enforced number, not a comment. | ✅ Complies |
| `spacedReview` | `js/baa-revision.js` (M24) | Real intervals confirmed in source (as of this audit): `INTERVALS = [1, 3, 7, 15, 30, 60]` days, with the index clamp updated to `Math.min(5, ...)` so the new 60-day interval is actually reachable, not dead data. | ✅ Complies. **Correction made during this audit:** the code previously used `[1,3,7,14,30]` (14 instead of 15, no 60-day interval), which didn't match the Blueprint's own stated "1/3/7/15/30/60-day review rhythm." Fixed to match exactly, since the discrepancy was small, low-risk, and directly actionable rather than left as an open gap. |
| `avoidShameLanguage` | Product-wide UI copy | Enforced by a real, executable CI test — `test/run-m60-content-review-tests.js` (Module 60) — which scans real, currently-shipped visible text across 6 pages (536 real text nodes as of this writing) against `js/baa-purpose-design.js`'s `safeCopy()` checker. | ✅ Complies (0 flagged phrases, verified by running the test, not assumed) |

---

## What this document is not

This is not a claim that BAA's pedagogy is validated by learning-science research, nor a substitute for a qualified educator's judgment — `js/baa-pedagogy.js`'s own header comment states this directly, and this document inherits that same limitation. It is a record of what the code's own stated policy is, and whether the rest of the codebase actually follows it — re-checked against real source, not carried forward from an assumption.

## Maintenance note

If `js/baa-pedagogy.js`'s `POLICY` object changes, or if `M21`/`M24`/`M06` change how they sequence explanations or reviews, this audit should be re-run against the new source before this document is trusted again — the same standard the rest of this build has followed throughout.
