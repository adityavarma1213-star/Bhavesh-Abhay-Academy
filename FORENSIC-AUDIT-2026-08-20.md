# BAA Forensic Audit — 2026-08-20

## Scope
Audited the current repository against the BAA roadmap/blueprint notes and the production-oriented code paths. Findings are classified as **FIXED IN REPAIR BRANCH**, **CONFIRMED GAP**, or **NOT A BLUEPRINT REQUIREMENT**. A feature is not called production-verified unless a live HTTP test is actually executed.

## Critical findings

| ID | Area | Status | Finding |
|---|---|---|---|
| F-01 | Authentication | FIXED IN REPAIR BRANCH | `api/_lib/auth.js` treated the normalized postgres result as an array (`result.length`) while the DB wrapper exposes `{ rows }`. Authenticated API requests could therefore resolve to no session. |
| F-02 | AI Tutor | FIXED AT AUTH LAYER | Student OS sends Tutor requests to `/api/chat`; authenticated routes depend on session resolution. The F-01 mismatch could make the Tutor appear dead even when the chat endpoint/model configuration was otherwise valid. |
| F-03 | Keep Me Signed In | FIXED IN REPAIR BRANCH | The production index login modal had no Keep Me Signed In control. The repair branch injects the control and sends `remember:true` on login. |
| F-04 | Student direct access | CONFIRMED GAP | `student-os.html` still contains a name-only starter login and a visible message saying no real account is needed. This can bypass the production account boundary. A later hardening pass should replace this with a real `/api/auth/me` gate while preserving the separate demo mode. |
| F-05 | Student dashboard truthfulness | CONFIRMED GAP | Several dashboard values are literal sample values (XP, level, streak, rank, weekly progress, today's goals, recommendation text). Some are not marked preview. They should either be hydrated from real evidence or explicitly labelled preview. |
| F-06 | Challenge Arena | CONFIRMED GAP | The dashboard says challenges are live-ready, but the displayed waiting challenge/request controls are not connected to a complete server-backed challenge workflow. |
| F-07 | Leaderboard | CONFIRMED GAP | The visible leaderboard contains hardcoded names/XP values. It is not a live database leaderboard. |
| F-08 | Achievements | CONFIRMED GAP | The trophy-room UI explicitly says preview and is not tied to actual activity. The separate Rewards module is evidence-backed, creating two competing reward surfaces. |
| F-09 | Community | CONFIRMED GAP | The world overlay contains sample posts and explicitly says it is preview content. The separate community module provides local stored posts. The two surfaces should be unified. |
| F-10 | Coding Lab | CONFIRMED GAP | The Coding Lab world is a visual/editor mock with a generated contribution grid. It is not a real code execution or GitHub-connected coding environment. |
| F-11 | Virtual Labs | PARTIALLY FUNCTIONAL | The Student OS contains a real deterministic lab tool section backed by `BAALabs`, but the main Science Lab world is only a collection of descriptive cards. These should be unified. |
| F-12 | Quiz Arena | PARTIALLY FUNCTIONAL | The visible world is a single hardcoded triangle question with a local timer. It is not the full assessment/question-bank/challenge system. |
| F-13 | AI Tutor copy | CONFIRMED GAP | Student OS describes the Tutor as wired to a “real Claude model”, while the repository's production AI integration is Gemini-based. This is misleading copy and should be corrected. |
| F-14 | Demo | WORKING AS INTERACTIVE DEMO | `demo.html` is an interactive five-minute walkthrough, not a recorded video. Its current UI honestly states that it is self-contained and not a recorded video. The homepage wording should say “Interactive 5-Minute Demo” rather than implying a video file. |
| F-15 | Syllabus upload | NOT A BLUEPRINT REQUIREMENT / CONFIRMED ABSENCE | The current M40 Curriculum module implements board/profile/mapping storage in local browser state. It contains no syllabus file-upload pipeline. The repository's roadmap note describes M40 as curriculum profile/mapping intelligence and explicitly says external curriculum sources are not claimed until connected. Therefore a production syllabus uploader cannot honestly be called “fixed” from the current code. |
| F-16 | Curriculum persistence | CONFIRMED GAP | M40 curriculum profile and mappings are stored in `localStorage`, not authenticated per-learner database persistence. This is acceptable only for the current prototype/local M40 implementation; it is not a production multi-device curriculum record. |
| F-17 | Live verification | UNVERIFIED | The repair session could not execute direct POST/credentialed HTTP tests against the Vercel deployment. Therefore no route is labelled LIVE-VERIFIED in this audit. |

## Blueprint-specific requirement checked

The Master Roadmap & Blueprint notes define the Mastery Gate, parent bypass, forecast, authenticated API, learner ownership, database persistence, red/green evidence transitions, progression blocking and tests as completion requirements for that cross-cutting feature. Those requirements must remain the acceptance standard; source comments claiming completion are not proof of live operation.

## Repair branch changes

Branch: `baa-forensic-repair-2026-08-20`

1. Corrected the authentication session result-shape mismatch.
2. Added the missing production Keep Me Signed In control and `remember:true` login payload.
3. Added this forensic audit so future completion claims can be checked against explicit evidence.

## Important non-claims

This audit intentionally does **not** call the repository 100% functional yet. The static/preview worlds, direct Student OS bypass, live challenge/leaderboard surfaces, and multi-device curriculum persistence remain open until they are either connected to real data or clearly separated as demo/prototype experiences.
