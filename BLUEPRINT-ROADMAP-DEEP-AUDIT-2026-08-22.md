# BAA Blueprint + Roadmap Deep Audit — 2026-08-22

## Audit rule
This is a strict source-and-acceptance audit of all 62 BAA M62 modules listed in `feature-map.html`, plus cross-cutting roadmap requirements documented in the repository. A module is not marked complete merely because a file exists or a Feature Explorer link exists. The strict gate is: visible UI control → real module call → rendered result → role/security boundary → intended persistence/integration → regression test → deployed-browser acceptance.

**Important:** GitHub source inspection cannot prove that a real user successfully clicked every control on the deployed Vercel site. Therefore the table deliberately keeps a live-browser gate pending where it has not been independently verified. This is not a 100% completion claim.

## Summary

| Metric | Result |
|---|---:|
| M62 modules audited | 62 / 62 |
| Source/UI/test-verified modules | 8 |
| Implemented by code/docs but live gate remains | 2 |
| Partial/pending modules | 44 |
| Genuine implementation gaps | 6 |
| Foundation-only system capabilities | 2 |
| Average estimated acceptance pending | 59.3% |

**Pending percentage definition:** an audit-gate estimate, not a fabricated product score. 25% means source/UI/test evidence exists but deployed-browser acceptance remains; 50–75% means additional persistence/integration/feature work remains; 100% means the real feature/service is absent. External-provider items cannot be truthfully completed without the provider/data/credentials.

## M1–M62

| # | Feature | Status | Pending | Why pending / owner |
|---:|---|---|---:|---|
| 1 | AI Mode | 🟡 Pending | 50% | Student OS host/control exists; strict live browser acceptance not verified. **Owner:** Our code/audit. |
| 2 | Custom / Individual Mode | 🟡 Pending | 50% | Student OS workflow exists; live acceptance not verified. **Owner:** Our code/audit. |
| 3 | Hybrid Mode | 🟡 Pending | 50% | Student OS workflow exists; live acceptance not verified. **Owner:** Our code/audit. |
| 4 | AI Tutor | 🟡 Pending | 50% | Tutor entry/code exists; real deployed AI interaction needs verification/credentials. **Owner:** Our code/audit. |
| 5 | AI Mentor Chat | 🟡 Pending | 75% | UI/module exists, but mentor service/data path is not production-verified. **Owner:** Our code/audit. |
| 6 | Smart Assessment System | 🟡 Pending | 50% | Assessment engine exists and is tested; deployed end-to-end acceptance remains. **Owner:** Our code/audit. |
| 7 | Transparent AI Evaluation | 🟡 Pending | 50% | Evaluation/rationale exists; live end-to-end verification remains. **Owner:** Our code/audit. |
| 8 | AI Homework Scanner | 🟡 Pending | 75% | Scanner exists; homework evidence/assessment persistence gap remains. **Owner:** Our code/audit. |
| 9 | AI Learning Memory | 🟡 Pending | 50% | Derived mastery persistence is implemented; raw evidence/assessment persistence remains blocked. **Owner:** Our code/audit. |
| 10 | AI Confidence Meter | 🟡 Pending | 50% | Evidence-confidence capability exists; live workflow not independently accepted. **Owner:** Our code/audit. |
| 11 | AI Planner | 🟡 Pending | 50% | Per-learner planner persistence fixed; recommendation source evidence still local. **Owner:** Our code/audit. |
| 12 | AI Guardian | 🔴 Gap | 100% | Gap register says the feature does not yet exist as a real implementation. **Owner:** Our code/audit. |
| 13 | AI Prediction Engine | 🟡 Pending | 50% | Forecast + Mastery Gate exist; real evidence and deployed acceptance remain. **Owner:** Our code/audit. |
| 14 | Parent Dashboard | 🟡 Pending | 75% | Parent UI exists, but dashboard read-side server persistence was explicitly still local. **Owner:** Our code/audit. |
| 15 | Parent Approval Mode | 🟡 Pending | 50% | Governance workflow exists; live parent re-auth/bypass acceptance remains. **Owner:** Our code/audit. |
| 16 | Teacher Recommendation System | 🟡 Pending | 75% | Teacher UI/module exists; production data/analytics path not fully verified. **Owner:** Our code/audit. |
| 17 | Teacher Analytics | 🟡 Pending | 75% | Teacher analytics surface exists; server-backed/live acceptance remains. **Owner:** Our code/audit. |
| 18 | School Calendar Integration | 🟡 Pending | 75% | Planner/calendar context exists; real external calendar integration not verified. **Owner:** Our code/audit. |
| 19 | AI Learning Passport | 🟡 Pending | 75% | Capability is present; portable/server-backed cross-device acceptance remains. **Owner:** Our code/audit. |
| 20 | AI Career & Future Planning | 🟡 Pending | 75% | Career module exists, but career explainability is explicitly missing. **Owner:** Our code/audit. |
| 21 | Practice Engine | 🟢 Verified in source/UI tests | 25% | Reachability matrix specifies real click → module call → rendered result; live deployment still needs manual acceptance. **Owner:** Our code/audit. |
| 22 | Weakness Engine | 🟢 Verified in source/UI tests | 25% | Reachability matrix specifies real click → module call → rendered evidence state. **Owner:** Our code/audit. |
| 23 | Strength Engine | 🟢 Verified in source/UI tests | 25% | Reachability matrix specifies real click → module call → rendered evidence state. **Owner:** Our code/audit. |
| 24 | Revision Engine | 🟡 Pending | 50% | Host workflow exists; full evidence/persistence acceptance remains. **Owner:** Our code/audit. |
| 25 | Goal Tracking | 🟡 Pending | 50% | Planner goals persist server-side; end-to-end goal UX still needs deployed acceptance. **Owner:** Our code/audit. |
| 26 | AI Notes Generator | 🟡 Pending | 75% | Teacher notes capability exists; live AI/server acceptance remains. **Owner:** Our code/audit. |
| 27 | AI Learning Resources | 🟡 Pending | 75% | Resource capability exists; recommendation/provider path not fully verified. **Owner:** Our code/audit. |
| 28 | Explain Like... Mode | 🟡 Pending | 50% | Student control exists; live acceptance remains. **Owner:** Our code/audit. |
| 29 | AI Learning Paths | 🟡 Pending | 50% | Learning-path framework exists; live progression acceptance remains. **Owner:** Our code/audit. |
| 30 | Achievement & Rewards | 🟡 Pending | 75% | Home UI is explicitly preview/sample; real rewards tracking persistence remains. **Owner:** Our code/audit. |
| 31 | Multilingual Learning | 🟢 Verified in source/UI tests | 25% | Reachability matrix specifies language selection → module call → rendered list. **Owner:** Our code/audit. |
| 32 | Voice Learning Assistant | 🟢 Verified in source/UI tests | 25% | Reachability matrix specifies Speak/listen → voice module → rendered result; production browser acceptance remains. **Owner:** Our code/audit. |
| 33 | Interactive Virtual Labs | 🟢 Verified in source/UI tests | 25% | Reachability matrix specifies lab selection → run → rendered result. **Owner:** Our code/audit. |
| 34 | School & Coaching Management | 🟢 Verified in source/UI tests | 25% | Reachability matrix specifies teacher input → school module → rendered state. **Owner:** Our code/audit. |
| 35 | Community & Collaboration | 🟢 Verified in source/UI tests | 25% | Reachability matrix specifies post → community module → rendered result; production backend still needs verification. **Owner:** Our code/audit. |
| 36 | AI Insights Dashboard | 🟡 Pending | 75% | Insights surface exists; server-backed evidence completeness remains. **Owner:** Our code/audit. |
| 37 | AI Trust, Privacy & Compliance | 🟡 Pending | 50% | Trust center exists; legal compliance and production secure storage are explicitly not implemented. **Owner:** Our code/audit. |
| 38 | Explainable AI Framework | 🟡 Pending | 50% | Core explainability exists; career/guardian explainability gaps remain. **Owner:** Our code/audit. |
| 39 | AI Review & Appeal | 🟡 Pending | 25% | Appeal/review capabilities are implemented/tested; live browser and server acceptance remain. **Owner:** Our code/audit. |
| 40 | Curriculum & Board Intelligence | 🟡 Pending | 75% | Curriculum capability exists; real board intelligence/data source not verified. **Owner:** Our code/audit. |
| 41 | Smart Low-Bandwidth Learning | 🟡 Pending | 75% | Low-bandwidth capability is present; complete production/offline acceptance remains. **Owner:** Our code/audit. |
| 42 | AI Safety & Anti-Cheating | 🟡 Pending | 50% | Anti-cheating code exists; live assessment integrity acceptance remains. **Owner:** Our code/audit. |
| 43 | AI Scholarship Finder | 🔴 Gap | 100% | No real scholarship data/service is implemented; only feature-map entry exists. **Owner:** External/provider or product decision. |
| 44 | Internship & Job Preparation | 🟡 Pending | 75% | Career-prep module exists; external job/internship data path not verified. **Owner:** External/provider or product decision. |
| 45 | Mentor Marketplace | 🔴 Gap | 100% | No real marketplace/provider is implemented; repository explicitly avoids claiming one. **Owner:** External/provider or product decision. |
| 46 | School ERP Integration | 🔴 Gap | 100% | No live ERP integration/provider is implemented. **Owner:** External/provider or product decision. |
| 47 | Institution Analytics Portal | 🟡 Pending | 75% | Teacher/institution analytics foundation exists; production institutional data path not verified. **Owner:** Our code/audit. |
| 48 | Global Student Collaboration | 🔴 Gap | 100% | No production global collaboration service is implemented. **Owner:** External/provider or product decision. |
| 49 | Olympiad & Competition Center | 🔴 Gap | 100% | No live competition data/provider is implemented. **Owner:** External/provider or product decision. |
| 50 | Plugin & Integration Marketplace | 🟡 Pending | 75% | Plugin foundation exists; marketplace execution/catalog is not production-ready. **Owner:** Our code/audit. |
| 51 | Learning Science & Pedagogy | 🟡 Pending | 50% | Pedagogy framework exists as system logic; full roadmap acceptance is not independently verified. **Owner:** Our code/audit. |
| 52 | Mistake Archeology & Confusion Map | 🟡 Pending | 75% | Mistake analysis exists, but raw evidence persistence is a documented blocker. **Owner:** Our code/audit. |
| 53 | Learning Outcome Measurement | 🟡 Pending | 75% | Outcome capability exists; complete server-backed evidence chain is not finished. **Owner:** Our code/audit. |
| 54 | Psychological Safety & Cognitive Recovery | 🟢 Implemented by code/docs | 25% | Cognitive-safety controls and humane messaging are implemented/tested; deployed acceptance remains. **Owner:** Our code/audit. |
| 55 | Student Data Trust & Fresh Start | 🟡 Pending | 50% | Fresh-start/export/delete controls exist; server/legal deletion is not implemented. **Owner:** Infrastructure. |
| 56 | Adaptive Pacing & Productive Planning | 🟡 Pending | 50% | Adaptive pacing/planner code exists; evidence source and live acceptance remain. **Owner:** Our code/audit. |
| 57 | Parent Learning Conversation Assistant | 🟡 Pending | 75% | Parent conversation capability exists; production/server evidence path remains. **Owner:** Our code/audit. |
| 58 | Teacher Diagnostic & Differentiation | 🟡 Pending | 75% | Teacher diagnostic foundation exists; production evidence/analytics path remains. **Owner:** Our code/audit. |
| 59 | Human-in-the-Loop Governance | 🟡 Pending | 25% | Review/override/governance patterns exist; live acceptance and operational governance remain. **Owner:** Our code/audit. |
| 60 | Emotion + Purpose Design System | 🟢 Implemented by code/docs | 25% | Design-system rules are applied; complete deployed accessibility/UX acceptance remains. **Owner:** Our code/audit. |
| 61 | One-Year Private Testing & Founder Lab | 🔵 Foundation | 75% | Documented as system/private-testing capability; no separate production UI/service is claimed. **Owner:** Product decision. |
| 62 | BAA AI Council | 🔵 Foundation | 75% | Governance foundation exists; no invented live reviewer/council service is claimed. **Owner:** Product decision. |

## Cross-cutting roadmap gates

| Requirement | Status | Pending | Why pending / owner |
|---|---|---:|---|
| Mastery Gate | 🟡 Pending | 25% | Core red/green progression, parent bypass and forecast code/docs exist; strict deployed multi-user acceptance remains. **Owner:** Our code/audit. |
| Parent bypass audit trail | 🟡 Pending | 25% | Authenticated parent re-entry/reason/audit path is implemented in source; live database verification remains. **Owner:** Our code/audit. |
| Assessment raw evidence persistence | 🔴 Blocked | 100% | `learning_evidence` requires assessment/question foreign keys, but assessment content is not seeded server-side. This needs a content migration or schema decision. **Owner:** Our code + product decision. |
| Planner persistence | 🟢 Implemented in source/tests | 25% | Per-learner planner tables and sync were implemented and tested; live Postgres acceptance remains. **Owner:** Our code/audit. |
| Learning-memory derived persistence | 🟢 Implemented in source/tests | 25% | Derived mastery summary/history sync is implemented and tested; raw evidence remains blocked. **Owner:** Our code/audit. |
| Homework/rewards/assessment-attempt persistence | 🔴 Gap | 100% | Repository gap register explicitly says these backend paths exist but client calls are not yet wired. **Owner:** Our code/audit. |
| Trust/legal compliance | 🔴 Pending external | 100% | COPPA/GDPR/FERPA compliance cannot be claimed from UI/code alone and requires legal/product controls plus G4/G5/G6 infrastructure. **Owner:** Product/legal + infrastructure. |
| Production secure storage/encryption | 🔴 Pending infrastructure | 100% | Explicitly disclaimed in the gap register; requires production backend/storage controls. **Owner:** Infrastructure. |
| Server-side deletion | 🟠 Pending backend | 100% | Current deletion is client-side; legally enforceable server purge requires production backend/storage. **Owner:** Infrastructure. |
| Real Gemini/photo verification | 🟠 Pending infrastructure | 100% | Requires deployed provider credentials and production verification. **Owner:** Infrastructure/credentials. |
| Real payment processing | 🟠 Pending infrastructure | 100% | Requires payment provider credentials, webhooks and production test transaction. **Owner:** Infrastructure/credentials. |
| External ERP/scholarship/mentor/competition services | 🟠 Pending provider | 100% | No real provider/data source is present; cannot invent external data. **Owner:** Provider/credentials. |
| Offline synchronization/conflict resolution | 🟡 Pending | 75% | Low-bandwidth/offline foundations exist, but complete multi-device conflict/sync acceptance is not verified. **Owner:** Our code/audit. |
| Accessibility/WCAG | 🟡 Pending | 50% | Some keyboard/focus work exists; complete WCAG audit has not been independently executed. **Owner:** Our code/audit. |
| Production monitoring/DR/staging | 🟡 Pending infrastructure | 75% | Repository documents the operational requirement, but full production observability/disaster recovery verification is not complete. **Owner:** Infrastructure. |

## Fixes already committed during this audit

- Fixed authenticated role-aware login routing in `account.html` so Teacher/Parent/Student destinations are selected from `/api/auth/me`.
- Added Teacher-role gating to `teacher-portal.html` and made the syllabus workflow reachable from Account.
- Added role enforcement to the server-backed Parent/Teacher learner view.
- Added `test/run-role-routing-tests.js`.
- Added `.github/workflows/baa-regression.yml` for JavaScript syntax checks and regression suites.
- Corrected the previous `62/62` UI claim so source wiring is not treated as live acceptance.

## Remaining work policy

No remaining item is marked complete merely because a module file exists. Where the blocker is external infrastructure, provider credentials, legal approval, or a deliberate schema/product decision, the repository must remain honest and show an explicit unavailable/foundation state rather than fabricate success. Where the blocker is code/UI/persistence work, it remains our engineering backlog and should be fixed in GitHub before release.
