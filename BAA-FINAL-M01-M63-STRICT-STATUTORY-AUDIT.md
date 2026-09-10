# BAA — FINAL STRICT STATUTORY AUDIT
**Date:** 28 August 2026
**Scope:** M01–M63, per BAA Blueprint V2.2/V2.3 + M63 Addendum, Permanent Scope Protection Rules.

---

## ENVIRONMENT LIMITATIONS — stated first, not buried

This sandbox has:
- **No browser rendering tool.** No screenshots, real or otherwise, were or could be produced. Every visual claim in this document is a source-code claim, not a rendered/observed one.
- **No deployment access.** No Vercel credentials, no network path to vercel.com. Deployment status is **NOT ATTEMPTED**, not "passed."
- **No live database.** `POSTGRES_URL` is unset. Every database claim below is **code-verified** (schema/query correctness read from source) — never **live-verified** (proven by an actual write/read against a running Postgres instance).
- **Git is local-only.** A real commit with a real hash can be made in this sandbox, but there is no remote — nothing is pushed or deployed by it.

Every status below is labeled with which of these it actually is. None of the four (coded / tested / deployed / live-verified) is used interchangeably with another.

---

## MID-AUDIT CORRECTION — reported prominently, not minimized

While running an automated dead-script sweep for this audit, I discovered `js/baa-ui-wiring-final.js` — a real, substantial, **self-initializing** UI wiring layer already present in the codebase before this session's work began, which I had never noticed in any earlier pass of this multi-session build. It injects real fallback UI cards (input fields, buttons, real module calls) for ~30 modules across `student-os.html`, `teacher-os.html`, and `parent-os.html`, entirely via JavaScript at page-load time — meaning it never appears in static HTML source, which is what every earlier "is this script tag dead?" check in this build relied on.

**Consequence:** several script-tag removals made earlier in this build (each individually justified at the time, based on inline-HTML-only evidence) were **wrong** — they broke real, working (if crude) fallback UI cards that `baa-ui-wiring-final.js` genuinely called. Verified and fixed in this session:

| Global | File | Page | Status before this audit | Fixed |
|---|---|---|---|---|
| `BAAFreshStart` | `js/baa-fresh-start.js` | student-os.html | Broken (script removed by me, Batch 6) | ✅ Restored |
| `BAAVoice` | `js/baa-voice.js` | student-os.html | Broken (script removed by me, Batch 4) | ✅ Restored |
| `BAAERP` | `js/baa-erp.js` | teacher-os.html | Broken (script removed by me, Batch 3) | ✅ Restored |
| `BAAInsights` | `js/baa-insights.js` | teacher-os.html | Broken (script removed by me, Batch 5) | ✅ Restored |
| `BAALanguage` | `js/baa-language.js` | student-os.html | **Broken before this entire build began** — never loaded on this page at all | ✅ Restored |

A new permanent regression test, `test/run-ui-wiring-final-dependency-tests.js`, now checks all 34 real cross-file dependency references this wiring layer has, on the correct page, every run — specifically to prevent this exact class of mistake (removing a script because inline HTML shows no call, without checking other loaded `.js` files) from recurring silently.

Three other tests written earlier in this build (`run-m31-m32-integration-tests.js`, `run-m36-m53-integration-tests.js`, `run-m43-m45-m46-integration-tests.js`) had asserted the *absence* of these scripts as correct; all three were corrected to assert their *presence* is correct, with the reasoning recorded in-line.

**This does not change any module's 🟢/🟡/🔴/⚫ classification** — the modules affected (M31, M32, M46, M36, M55) were already 🟢 through their own dedicated, superior implementations elsewhere on the same pages (e.g., M56's real Planner panel with a working Apply button, versus this wiring layer's cruder fallback card for the same module). This wiring layer is a secondary, lower-fidelity access point, not the primary evidence for any module's status — but it was real, it was broken by my own hand in 4 of 5 cases, and it is fixed now.

---

## REMEDIATION PASS — 2026-09-02, reported prominently, not minimized

A repository-truth audit on 2026-09-02 (initiated by a full M64–M78 execution request) established that the GitHub repository state at that time (845 commits, latest commit `8bd0ec9` "fix(m57): use text cursors for evidence history") **still contained the identical, previously-diagnosed and previously-fixed regression** in `api/ai-mode.js`, `api/evaluate.js`, and `api/evaluate-homework.js`: `corsHeaders`/`jsonError`/`jsonResponse`/`getClientIp` were called but not defined anywhere in those files. This was independently reproduced live by invoking each handler with a mocked request — all three threw `ReferenceError` immediately. **This means the 2026-08-29 remediation pass that fixed this exact bug was never pushed to GitHub** — it existed only in a local sandbox build, a gap now closed by reapplying that fix directly to this checkout. Practical effect prior to this fix: AI Mode, subjective-answer evaluation, and the Homework Scanner's AI evaluation path (including image evaluation) threw `ReferenceError` on every single request in the actual live repository, not merely in an old audit finding. See `REMEDIATION-REPORT-2026-09-02.md` for full detail, including confirmation this is very likely connected to the failing commit-check and failing Vercel Production deployment visible in the repository's own commit history at that time.

## PART A — Security / Ownership Boundary Sweep (Part D)

Automated, whole-router sweep of every route handler in `api/v1/[...route].js`: does it touch learner-scoped data, and if so, does it call `requireLearnerAccess` or `hasRole`?

- **Routes checked:** all 27 embedded route handlers (corrected from an earlier miscount of 30 in this same document — the dispatch table in `api/v1/[...route].js` was recounted directly, 2026-08-29, and reconfirmed 2026-09-02 against the actual GitHub state).
- **Flagged by automated sweep (learner-scoped data with no access-check call):** 1 (`my-learners`).
- **Manually investigated:** confirmed safe by construction — it never accepts a client-supplied `learnerId` to validate ownership of; it derives its entire result set from `session.user_id` through the real relationship tables (`parent_learner`, `teacher_learner`, `learners`). There is no external claim to check, so no ownership-check call is needed. `guide-robot-sessions` was also manually reviewed (outside the sweep's own learner-scoped-data trigger criterion, since it is keyed only to `session.user_id`) and is likewise safe by construction.
- **Real security gaps found: 0.**
- **Status:** Code-verified. Not live-verified (no live traffic was sent to a running server).

## PART B — Cache-Control / Privacy Sweep (Part E)

- **Correction (2026-08-29, reconfirmed 2026-09-02):** this claim as originally written was scoped only to `api/v1/[...route].js` ("the router") and did not check the rest of `api/`. A wider check found `api/chat.js`, `api/ai-mode.js`, `api/evaluate.js`, `api/evaluate-homework.js`, and `api/syllabus.js` bypassed the shared helper and had no `Cache-Control: no-store` of their own. Authentication was never affected. All five now set `Cache-Control: no-store` explicitly. The full security-header set (CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy) was never actually at risk across these five, since `vercel.json` applies those globally at the platform level to every route regardless of code path — that part of the original claim holds, just for a different reason than stated.
- `Cache-Control: no-store` is now applied consistently: via the shared `json()` response helper in `api/_lib/security.js` for every route in `api/v1/[...route].js`, and via each file's own response headers for the five standalone AI/upload endpoints named above.
- **Status:** Code-verified structurally guaranteed, not per-route spot-checked (didn't need to be, given the single-choke-point architecture) — not live-verified.

## PART C — Accessibility Sweep (Part G) — real finding, not a pass

- M63's own widget: **live-executed** (not just read) — a simulated DOM test genuinely dispatches click/keydown events and confirms the focus trap, `aria-expanded` state changes, and real Escape-to-close behavior. This is real evidence, not an assumption.
- **Native page accessibility outside M63:** checked precisely by subtracting M63's own known contribution (8 `aria-*` + 1 `role` per page) from each page's raw count. Result: **parent-os.html, teacher-os.html, teacher-portal.html, admin.html, and assessment.html show little to no native accessibility markup beyond what M63 added** — essentially unchanged from the state found in the very first audit of this codebase. `student-os.html` remains the one page with substantial native accessibility work (~72 aria-attrs, ~42 role-attrs beyond M63).
- **This is a real, currently unaddressed limitation**, reported honestly rather than allowed to hide behind the improved aggregate numbers.
- **Status:** Code-verified (markup presence) for M63; live-executed (behavior) for M63's interactive logic only. Not verified at all — code or live — for the 5 pages' own native forms/controls beyond that.

## PART D — Migration / Structural Sweep

- 22 migrations, `001` through `022`, no gaps, no duplicate numbers, every `CREATE TABLE` uses `IF NOT EXISTS` (idempotent).
- No `.bak`/`~`/`.orig`/`.tmp` files anywhere in the repository.
- Every `.js` file in the repository passes `node --check` — zero syntax errors, whole repo.
- Every inline `<script>` block across every `.html` page in the repository passes the same check.
- **Status:** Code-verified. Not live-verified (migrations were never actually run against a live database in this environment).

## PART E — Duplicate Implementation Sweep

Beyond the `baa-ui-wiring-final.js` discovery above (which was a *real, functioning* secondary implementation, not a dead one), no further duplicate-implementation issues were found in this pass. The known, already-disclosed prior cleanups (M55, M17, M31 inline-vs-module, M32) remain correctly resolved — each has exactly one *primary* real implementation per module, matching the standard this build has held throughout.

---

## PART F — Live/Deployment/Browser Status — stated plainly

| Layer | Status |
|---|---|
| Blueprint → Code | ✅ Done, verified by direct source inspection |
| Code → Integration (module-to-module wiring) | ✅ Done, verified — including the correction above |
| Code → Security (authz boundaries) | ✅ Code-verified, sweep above |
| Code → Database (schema/migrations) | ✅ Code-verified. **Not live-verified — no database connection exists in this environment.** |
| Code → Tests | ✅ 119/120 passing, real numbers, re-run fresh for this audit |
| Code → Deployment | ⛔ **NOT ATTEMPTED.** No Vercel access in this environment. |
| Code → Real Browser | ⛔ **NOT ATTEMPTED.** No browser rendering tool in this environment. |
| Code → Screenshots | ⛔ **Genuine screenshots could not be produced because browser rendering is unavailable.** No mockup was fabricated in this document either — this table states the limitation instead. |

---

*Full per-module evidence: see `FINAL-M01-M63-COMPLETION-MATRIX.md`. Full engineering detail and build history: see `BAA-MASTER-ENGINEERING-SPEC.md`.*
