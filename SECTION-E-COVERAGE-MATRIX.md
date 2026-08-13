# SECTION E — COVERAGE MATRIX

Audited before and during implementation, per the blueprint's mandate.
Format: Blueprint requirement → Existing implementation (A–D/G1–G3) → Gap →
Section E change → Future dependency → Test.

## Module 37 — AI Trust, Privacy & Compliance Center

| Requirement | Existing (A–D/G1–G3) | Gap | Section E change | Future dependency | Test |
|---|---|---|---|---|---|
| Explain what data is collected / why / who can access it | Each section's README documented this in prose, scattered across files | No single place a student/parent could see it | `js/baa-trust.js` `getDataInventory()` (9 real, code-derived entries) + `trust-privacy.html` | none | E-Inv1–3 |
| Retention-policy information | Not centralized | No honest, single retention statement | `getRetentionPolicyText()` — explicitly disclaims legal-compliance claims | Real backend retention policy = G4/G5 | E-Ret1–2 |
| Parental consent | None existed | No consent surface at all | `recordConsentAcknowledgement()` / `revokeConsentAcknowledgement()`, explicitly labeled **local acknowledgement, not verified consent** | Verified, tamper-proof consent = G4 (real accounts + backend) | E-Consent1–6 |
| Auditability | G1's `teacherReviews`/history already non-destructive; no user-facing log | No visible activity trail | `activityLog` in `baa-trust.js`, appended (never rewritten) on every consent/export/deletion action | Tamper-proof server audit log = G4/G6 | E-Consent5, E-Del5 |
| Explainable trust/privacy information | N/A | N/A | Every control on `trust-privacy.html` states what it does and doesn't do in plain language | — | manual review (page content) |
| Compliance groundwork, without false claims | Section README's already followed "never claim compliance" pattern | Needed a page-level statement | `trust-privacy.html` scope banner explicitly disclaims COPPA/GDPR/FERPA/"production secure"/"fully encrypted" | Real compliance posture = G4/G5/G6 | E-Ret2 |

**Status: 🟢 Implemented** (as a client-side foundation) / 🟠 verified compliance and tamper-proof audit are G4+ dependencies, stated as such throughout.

## Module 38 — Explainable AI Framework

| Requirement | Existing (A–D) | Gap | Section E change | Future dependency | Test |
|---|---|---|---|---|---|
| Career recommendations explainability | **Does not exist as a feature** (Career Mode is a UI card/link only, no AI recommendation engine) | N/A — nothing to explain | Documented honestly in `trust-privacy.html`'s gap-note rather than inventing a fake explanation | Career recommendation engine itself is a future-section feature | manual review |
| Confidence-score changes | `js/baa-intelligence.js` already computes `evidenceConfidence` (`high`/`medium`/`low`/`insufficient_evidence`) per concept | Already explainable via `whyForConcept()` | No change — reused, not duplicated, per blueprint instruction | — | pre-existing Section C tests (`run-tests.js` T3) |
| AI Guardian alerts | **Does not exist as a feature** in this codebase (grep confirmed no "Guardian" system) | N/A | Documented as not-yet-built, not fabricated | Future section | manual review |
| Predictions | Section C's trend (`improving`/`declining`/`stable`) is the only prediction-like signal, already gated on ≥4 evidence points | Already explainable | No change | — | pre-existing |
| Planner/timetable adjustments | `js/baa-planner.js`'s `why` string per task, already reuses `whyForConcept()` | Already explainable | No change | — | pre-existing |
| Learning recommendations | Same as planner — `getTargetedPracticeRecommendations()` already gives a concrete `reason` | Already explainable | No change | — | pre-existing |
| Assessment/evaluation decisions | `assessment.html`'s results view already shows AI `explanation`, `confidence`, `errors`, `missingConcepts` per question | Explainable, but no path to challenge a decision that DOES have an explanation | Section E added the "Request re-evaluation" link next to every AI-graded question (Module 39 tie-in) | — | manual review + E-Appeal tests |

**Status: 🟢 Implemented for every AI decision that actually exists in this codebase.** No second intelligence/explanation engine was created — `whyForConcept()` remains the single source of truth (blueprint instruction followed). Career recommendations and "AI Guardian" are honestly marked 🔴 not yet built anywhere, not retrofitted with fake explanations.

## Module 39 — AI Review & Appeal System

| Requirement | Existing (Section B) | Gap | Section E change | Future dependency | Test |
|---|---|---|---|---|---|
| Student re-evaluation requests | Only AI-flagged questions entered the review queue; a student had no way to contest an un-flagged score | Appeals impossible on non-flagged questions | `BAAAssessment.requestReevaluation()` — builds a real review row if none exists, reopens the existing one if it does | — | E-Appeal1–5 |
| Parent appeal path | Same as above | Same | `requestedBy: 'parent'` supported identically; UI in `trust-privacy.html` | Verified parent identity = G4 (accounts exist per-browser only) | E-Appeal4 |
| Teacher override | `submitTeacherReview()` already implements accept/edit/reject | None | Reused unchanged | — | pre-existing + E-Appeal6 |
| Human review for subjective answers | Existing `humanReviewRequired` flagging | None | Unchanged | — | pre-existing |
| Grading-change history/versioning | Single `originalAiEvaluation` only — a SECOND teacher decision would have silently overwritten the first | A re-decided review lost its first human decision | `decisionHistory[]` — pushed BEFORE any overwrite, on both direct re-review and appeal-reopen paths | — | E-Appeal9–10 |
| Preservation of original AI evaluation | `qResult.originalAiEvaluation`, copied once | Held even through appeals (verified) | Unchanged, confirmed still intact after 2 rounds of decisions | — | E-Appeal7, E-Appeal11 |
| No silent replacement of teacher decisions | N/A before E | A second `submitTeacherReview` call did silently replace the first | Fixed via `decisionHistory` (see above) | — | E-Appeal9 |
| No silent modification of historical evaluation records | N/A before E | Same as above | Same fix | — | E-Appeal9–10 |

**Status: 🟢 Implemented, built directly on Section B's existing queue** — `teacher-review.html` was extended (appeal badge, decision-history note), not duplicated.

## Module 54 — Student Psychological Safety & Cognitive Recovery

| Requirement | Existing (A–D) | Gap | Section E change | Future dependency | Test |
|---|---|---|---|---|---|
| Healthy stopping points | Planner already avoids pile-ups (time-budgeted, ≤6 tasks/day) | Partial — no session-level pacing | `js/baa-wellbeing.js` session-time break suggestion | — | E-Well2 |
| Break reminders | None | Missing | `checkBreakSuggestion()` / dismissible banner in `student-os.html` | — | E-Well1–3, E-Well6 |
| Movement/offline suggestions | None | Missing | Suggestion copy explicitly proposes offline/movement breaks | — | manual review of `SUGGESTIONS` copy |
| Healthy learning pacing | Planner's time budget (Section C) already does this for daily tasks | None for session length | Session-level addition above | — | E-Well2 |
| No shame-based messaging | Planner's missed-task banner (Section C) already avoided "you failed" language | Verified, not previously tested | Added `supportiveMissedTaskCopy()`/`supportiveLowScoreCopy()` as the SHARED source, tested against a banned-phrase list | — | E-Well4–5 |
| No punishment-style animations | None exist in the codebase (confirmed by inspection — no relevant CSS/JS) | N/A | N/A — nothing to remove | — | manual review |
| No unnecessary child-to-child comparison | Section D's `parent-os.html` already explicitly states no comparisons exist (single-student build) | None | Unchanged | Real multi-student comparison, if ever built, is a future G-section concern | pre-existing |
| No dark patterns to maximize screen time | N/A before E | Nothing prevented one from being added later | `baa-wellbeing.js`'s design-rules header + tests (E-Well1: reminders respect being turned off; E-Well6: no premature nagging) | — | E-Well1, E-Well6 |
| Escalation toward human help where architecture supports it | Teacher Review / Teacher Notes already exist as human-reachable paths | None new needed | Appeal path (Module 39) doubles as an escalation path | Real-time crisis escalation needs a backend/notification system = G4+ | manual review |

**Status: 🟢 Implemented as a session-pacing layer**, reusing Section C's existing pacing philosophy rather than building a separate wellness app (blueprint instruction followed).

## Module 55 — Student Data Trust & Fresh-Start Controls

| Requirement | Existing | Gap | Section E change | Future dependency | Test |
|---|---|---|---|---|---|
| Explain what/why/who/retention | — | Missing | Module 37's `getDataInventory()` (shared) | — | E-Inv1–3 |
| Deletion controls | None | Missing | `requestDeletion()` / `fulfillDeletion()`, scoped `this_app_only` vs `everything` | Server-side, legally-binding deletion = G4/G5 | E-Del1–6, E-DelAll1–3 |
| Parental consent | — | Missing | Shared with Module 37 | Verified consent = G4 | E-Consent1–6 |
| Protection of uploaded images | `js/image.js` already never persists images (confirmed by code inspection) | None — just needed honest documentation | Documented in `getDataInventory()` | — | E-Inv2 |
| Protection of voice data | `api/speak.js` already never persists audio | None — same | Documented in `getDataInventory()` | — | E-Inv3 |
| Protection of conversations | AI Tutor chat is not persisted to any BAA store today (confirmed: no chat-history key exists in `localStorageAdapter.js`) | None found | Noted in coverage; not separately listed in inventory since no store exists to describe | If chat history is ever persisted, it must be added to the inventory then | manual review |
| Protection of learning profiles | Section B/C stores | Needed export/deletion coverage | Covered by `exportAllData()` / `freshStart()` / `requestDeletion()` | — | E-Export1–2, E-Fresh1–6 |
| Controlled fresh-start/archive capability | None | Missing entirely | `freshStart()` — archives metadata, clears active B/C data, **explicitly preserves teacherReviews** | — | E-Fresh1–6 |
| Protection against improper destruction of required records | N/A before E | A naive "clear everything" would have destroyed review/appeal history | `freshStart()` never touches `teacherReviews`; `this_app_only` deletion likewise leaves the trust/audit record itself intact | — | E-Fresh5, E-Del4 |
| Honest storage-security labeling | Every section already labels itself `LOCAL_BROWSER_STORAGE_TESTING_ONLY` | None | `baa-trust.js` follows the same convention + explicit scope banner | Real secure storage = G4/G5/G6 | manual review |

**Status: 🟢 Implemented as a client-side foundation.**

## Module 59 — Human-in-the-Loop Learning Governance

| Requirement | Existing | Gap | Section E change | Future dependency | Test |
|---|---|---|---|---|---|
| AI recommendations can be reviewed | Section B review queue | None | Extended via appeal (Module 39) | — | E-Appeal tests |
| Teachers can override educational recommendations | `submitTeacherReview` | None | Unchanged | — | pre-existing |
| Disputed evaluations can enter Review & Appeal | Was one-directional (AI→queue only) | Fixed by `requestReevaluation` | Module 39 change | — | E-Appeal1–5 |
| Important uncertainty must be surfaced | Section B/C already surface `confidence`/`insufficient_evidence` | None | Reused; documented explicitly in `trust-privacy.html`'s Module 38/59 card | — | manual review |
| Sensitive situations can escalate to an authorized human | Teacher Review / Notes | None new | Appeal path serves this | Real-time alerting = G4+ | manual review |
| AI assists; humans remain accountable | Already the architecture's premise throughout A–D | None | Reaffirmed in `trust-privacy.html` copy | — | manual review |
| No AI output silently becomes an irreversible decision | Was TRUE except for the decision-overwrite bug found in Module 39 | Same bug as above | Fixed by `decisionHistory` | — | E-Appeal9 |

**Status: 🟢 Addressed — mostly by fixing the one real gap (silent decision overwrite) and documenting the rest, per blueprint instruction not to duplicate existing governance.**

## Module 60 — Emotion + Purpose Design System

| Requirement | Existing | Gap | Section E change | Future dependency | Test |
|---|---|---|---|---|---|
| Emotional safety | Section C's missed-task banner already avoided blame language | Not centralized/tested | Centralized in `baa-wellbeing.js`, tested | — | E-Well4–5 |
| Purposeful learning | Every task already carries a real `why` (Section C) | None | Unchanged | — | pre-existing |
| Healthy engagement | Planner's time-budget behavior | Session-level gap | Module 54's break suggestion | — | E-Well2 |
| No manipulative engagement loops | None present (confirmed by inspection: no streaks/badges/scarcity timers anywhere in the codebase) | N/A | N/A | — | manual review |
| No shame | Same as Emotional safety row | — | Same | — | E-Well4–5 |
| No unnecessary comparison | Section D explicit no-comparison design | None | Unchanged | — | pre-existing |
| Meaningful progress feedback | Section C's `why` strings, Section B's per-question explanations | None | Unchanged | — | pre-existing |
| Appropriate stopping points | Planner's daily budget + new session-break suggestion | — | Module 54 | — | E-Well2 |

**Status: 🟢 Applied to existing UX** — this is a design-system requirement, not a separate feature, and no separate feature was built to "claim" it (per blueprint instruction).

---

## Audit of existing A/B/C/D functionality for safety/trust gaps (mandatory cross-check)

- **Section A (AI Tutor):** no persisted chat history to protect (confirmed) — nothing to add.
- **Section B (Assessment/Review):** found and fixed the silent-decision-overwrite gap (Module 39/59) — see above. No other gap found; `originalAiEvaluation` preservation was already correct.
- **Section C (Planner):** already followed healthy-pacing and honest-explanation principles; Section E added the one missing piece (session-level break reminder) without altering Section C's own files.
- **Section D (Parent/Teacher OS):** already honestly labeled single-student/no-comparison; no gap found beyond needing a discoverable link to the new Trust & Privacy Center (added).
- **G2 (Authentication):** consent/trust record added is deliberately a NEW key (`baa_section_e_trust_v1`), never touching `baa_section_g2_accounts_v1` (verified — E-Regr tests).
- **G3 (Authorization):** unchanged; verified untouched by every Section E write (E-Regr2).
