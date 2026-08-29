# BAA Master Roadmap & Blueprint PDF

Sources used:
- BAA Master Blueprints & Architecture Reference Report
- BHAVESH_ABHAY_ACADEMY_Complete_Blueprint.md
- BAA_MASTER_DEVELOPMENT_ROADMAP_V2.2_FINAL.md

The PDF preserves source-defined terminology and labels the added examples as illustrative examples. It does not silently convert open blueprint items into official acceptance criteria.

## 2026-08-11 — Cross-Cutting Feature Addition: Mastery Gate + Parent Bypass + Exam Forecast

The BAA learning loop now includes a formal **Mastery Gate** control spanning assessment, learning evidence, AI Mode/Custom Mode assessment entry, Planner exam forecasting, Student OS and Parent OS.

### New functional requirement

When a student completes an assessment/exam, BAA must surface genuine findings (including substantive spelling/terminology findings returned by the evaluator) as **red**. A later assessment can turn a finding **green** only when the evidence shows that the finding has been cleared. BAA must not move the student to the next configured chapter/subject while the previous chapter has unresolved red findings.

### Parent exception path

A linked parent may bypass one specific chapter by authenticating through their existing parent account session, re-entering the account password and supplying a reason. The bypass is persisted and audited; it does not delete findings. The next assessment re-checks the chapter.

### Forecast requirement

Upcoming assessments linked to the BAA assessment catalog receive an evidence-based predicted percentage/range and warning level for the student and parent. Forecasts must use real evidence and explicitly return insufficient evidence when the sample is too small.

### Completion evidence

The feature is considered implemented only when the UI, authenticated API, learner ownership, database persistence, parent re-authentication, red/green transition, progression block, bypass audit trail, forecast calculation and tests all pass.

## 2026-08-28 — Post-M63 Innovation Addendum: BAA Littles

A dedicated early-childhood experience has been added to the future BAA roadmap for **Nursery / Jr. KG / Sr. KG learners (approximately ages 2.5–5)**.

### Direction

**BAA Littles — Learn • Play • Explore • Grow** is planned as an additional age-appropriate experience within the BAA OS ecosystem. It does **not** replace or remove the existing Galaxy Student OS.

### Theme and companion

The initial environment is **Wonder Garden**, using a warm, bright, familiar-world design rather than the older-learner cosmic interface. The primary companion is **Glowby the Firefly**, supported by Ellie the Elephant, Poppy the Puppy, Ollie the Owl, Bhavesh & Abhay explorer characters, and expressive Shape Friends.

### Planned learning model

BAA Littles will use audio-first guidance, large touch targets, simple picture-led navigation, short 2–4 minute activities, zero-penalty retry feedback, and positive celebrations. Learning Adventures can combine early numeracy, language, observation, motor skills, creativity and music in one child-friendly activity.

### Parent Co-Pilot

The parent is an expected co-pilot for this age band. Planned controls include session summaries, what the child practiced, time spent, suggested parent-child activities, age-appropriate preferences, and safety/privacy controls.

### Growth path

The long-term identity is designed to grow with the learner:

**Little Glowby → Bright Glowby → Star Explorer → Knowledge Companion**

This provides a narrative bridge from early childhood into the existing primary/secondary/professional BAA learning universe.

### Source document

The detailed specification is maintained in **BAA-LITTLES-ROADMAP-ADDENDUM.md**. It is a **future roadmap/blueprint item**, not a claim that BAA Littles is already implemented or production-ready.
