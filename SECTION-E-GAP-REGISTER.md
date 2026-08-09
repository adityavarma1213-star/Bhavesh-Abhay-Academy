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
