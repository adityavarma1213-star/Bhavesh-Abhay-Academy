# SECTION E — BLUEPRINT GAP REGISTER

Legend: 🟢 IMPLEMENTED · 🟡 PARTIALLY IMPLEMENTED · 🔵 ARCHITECTURAL FOUNDATION ·
🟠 DEPENDENT ON FUTURE G4/G5/G6 · 🔴 NOT YET IMPLEMENTED

This register is refreshed against the current source as of 2026-08-24. Historical checkpoint notes may describe an earlier state; current source is authoritative.

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Data inventory (what/why/who/retention) | 🟢 | `trust-privacy.html`, code-derived, not templated |
| 2 | Retention policy statement | 🟢 | Explicitly disclaims legal-compliance claims |
| 3 | Parental consent | 🔵 | Local acknowledgement only — a foundation, not verified consent |
| 4 | Auditability / activity log | 🔵 | Real, append-only, but not tamper-proof without server controls |
| 5 | Legal compliance (COPPA/GDPR/FERPA) | 🔴 | Explicitly NOT claimed; requires legal/product/infrastructure controls |
| 6 | Explainability — concept states, trends, planner tasks | 🟢 | Implemented learning-intelligence explanations |
| 7 | Explainability — assessment/evaluation decisions | 🟢 | Implemented assessment rationale/history |
| 8 | Explainability — career recommendations | 🟢 | M20 career explainability evidence mapping/status distinctions/methodology/limitations are implemented and covered by a dedicated gate |
| 9 | Explainability — AI Guardian alerts | 🟢 | `js/baa-guardian.js` provides bounded academic-support alerts with explainable reasons; it is not a mental-health diagnostic system |
| 10 | Student/parent re-evaluation requests | 🟢 | `requestReevaluation()` and review flow |
| 11 | Teacher override | 🟢 | Teacher review/override flow exists |
| 12 | Grading-change history/versioning | 🟢 | `decisionHistory[]` and server review records |
| 13 | Preservation of original AI evaluation through appeals | 🟢 | Original evaluation is retained across decision rounds |
| 14 | Healthy stopping points / break reminders | 🟢 | Session-level, dismissible, off-by-default control |
| 15 | No shame-based messaging | 🟢 | Centralized + tested against banned-phrase list |
| 16 | No dark patterns for engagement | 🟢 | Engagement controls follow the humane-design rules |
| 17 | Data export | 🟢 | Real, live data, downloadable JSON |
| 18 | Fresh-start / archive | 🟢 | Preserves human review/appeal records by design |
| 19 | Scoped deletion (`this_app_only` / `everything`) | 🟢 | Client-side controls |
| 20 | Server-side / legally-enforceable deletion | 🟢 | Authenticated `/api/account/delete` calls the transactional `baa_delete_user_account` PostgreSQL function; live production verification remains a separate gate |
| 21 | Protection of uploaded images | 🟢 | Raw image bytes are not persisted by the homework data layer |
| 22 | Protection of voice/TTS audio | 🟢 | Audio is not persisted as a stored asset |
| 23 | Production-secure storage / encryption at rest | 🔴 | Requires production backend/storage controls |
| 24 | Page-level access gating for Trust & Privacy Center | 🟢 | `js/baa-themes.js` now server-checks `/api/auth/me` on `trust-privacy.html` and replaces the page with an authenticated sign-in gate when no valid session exists; deployed-browser acceptance remains pending |
| 25 | Human-in-the-loop governance (uncertainty surfaced, human accountable) | 🟢 | Review/override patterns + uncertainty states |
| 26 | Emotion + purpose design system application | 🟢 | Applied to existing UX |

---
## Current persistence audit

### Planner
Status: 🟢 **Implemented in source/tests; live production DB gate remains.** Preferences, goals, upcoming assessments and task history sync through the per-learner PostgreSQL planner tables.

### Learning Memory
Status: 🟡 **Partially implemented.** Derived mastery summary/history and mistake-pattern summary have server persistence. Raw question-level evidence depends on assessment/question rows existing server-side.

### Assessment attempts/results/evidence
Status: 🟡 **Server path exists and is security-validated.** `api/v1/[...route].js` accepts authenticated learner-scoped assessment snapshots, validates assessment/question ownership, re-grades deterministic questions server-side and requires signed AI verdicts for AI-graded questions. The remaining gate is production database/content verification, not absence of the route.

### Homework
Status: 🟡 **Server sync path exists.** `js/baa-homework.js` syncs learner-scoped submissions to `/api/v1/homework`; the remaining limitation is that the local/browser store remains part of the current testing architecture and complete production media/evidence integration is not yet claimed.

### Rewards
Status: 🟡 **Server-derived reward path exists.** The API derives XP/badges from server-backed assessment/evidence data and stores `learner_rewards`; deployed production acceptance remains pending.

### Parent/Teacher dashboards
Status: 🟡 **Server-backed learner-view helper now exists and enforces role.** Parent/Teacher pages still contain legacy local-data sections, so the final release gate is to prove the visible dashboard consistently uses the server-backed learner snapshot and does not present local preview data as production data.

---
## Mastery Gate / Forecast

Status: 🟡 **Implemented in source; strict deployed acceptance remains.** The current API contains progression-gate, parent-authenticated bypass, audit logging and evidence-based forecast logic. The gate is designed to block progression while red findings remain and to re-check after a later assessment.

---
## External / infrastructure gaps

These are not to be fabricated as complete:

- COPPA/GDPR/FERPA legal compliance
- Production encryption/secure storage
- Server-side deletion production verification and external-system deletion where applicable
- Real Gemini/photo verification with deployed credentials
- Real payment processing/webhooks
- Live ERP, scholarship, mentor-marketplace and competition providers
- Full multi-device offline conflict resolution
- Production monitoring/disaster recovery/staging

Where a provider or production credential is required, the UI must show an honest unavailable/foundation state until it is configured and tested.

---
## UI reachability correction

The previous `62/62 UI-reachable` wording was too strong. `UI-REACHABILITY-MATRIX.json` contains source-level reachability descriptions, but a deployed-browser click-through has not been independently completed for every module. The strict audit therefore keeps that gate pending instead of converting catalog/locator entries into completion claims.

The current strict M1–M62 table is in `BLUEPRINT-ROADMAP-DEEP-AUDIT-2026-08-22.md` and the visible website audit page is `blueprint-roadmap-audit.html`.
