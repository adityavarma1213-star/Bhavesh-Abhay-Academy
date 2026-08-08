# BAA OS — Bhavesh Abhay Academy

An AI-powered learning operating system. Pure HTML/CSS/JS, no build step — ready to deploy straight to GitHub Pages.

## Pages

| File | Description | Entry point |
|---|---|---|
| `index.html` | Landing page + login flow | Yes — set as homepage |
| `student-os.html` | Main student dashboard | Linked from `index.html` |
| `knowledge-universe.html` | Knowledge Universe (planet/subject explorer) | Linked from `student-os.html` |
| `mathematics-world.html` | Mathematics World (side-scrolling world) | Linked from `knowledge-universe.html` |
| `assessment.html` | **Section B** — Assessment catalog, player, and results | Linked from `student-os.html` ("Assessments" tile / next step) |
| `teacher-review.html` | **Section B** — minimum AI Evaluation Review queue (not the full Teacher OS) | Linked from `assessment.html` results page when an answer is flagged |

All navigation between pages uses relative links (`window.location.href = 'student-os.html'` etc.), so these files must stay in the same folder — no subfolders needed.

## Section B — Assessment + AI Evaluation

`assessment.html` plus `js/question-bank.js`, `js/baa-assessment.js`, and
`api/evaluate.js` implement the full Assess → Evaluate → Evidence →
Learning Memory → Mistake Archeology pipeline on top of Section A:

```
Student -> Assessment -> Answer -> Evaluation -> Human Review (if flagged)
        -> Learning Evidence -> Learning Memory -> Mistake Archeology
        -> AI Tutor -> Targeted Practice -> Reassessment -> Learning Outcome
```

### Human review (`teacher-review.html`)

Any answer the AI evaluator flags (`humanReviewRequired: true` — low
confidence, ambiguous, or a failed evaluation call) is queued in
`teacher-review.html`. A reviewer can **accept** the AI score, **edit** it
to a different mark, or **reject** it (0 marks), with an optional comment.
The original AI evaluation is never overwritten — `js/baa-assessment.js`'s
`submitTeacherReview()` copies it onto the question result once
(`originalAiEvaluation`) before applying the reviewer's decision, so both
the AI's first guess and the human's final call stay on record. A reviewed
question's Learning Evidence row is corrected to match the reviewer's
final score, so Learning Memory and Mistake Archeology are built on the
reviewed outcome, not the AI's unreviewed first pass. This is intentionally
minimal — one queue, one action set, no accounts — not the full Teacher OS
(Section D).

### AI Tutor connection

`student-os.html` calls `BAAAssessment.getLearningContextForTutor()` before
every chat send. It returns `null` unless there is real, evidence-gated
Section B data (a concept still `learning`/`needs_revision`, or a
confirmed "possible misconception" pattern) — in which case a short,
factual summary is sent to `api/chat.js` as an optional `learningContext`
field and folded into the tutor's system prompt with an explicit
instruction not to bring it up unprompted or treat it as a diagnosis. When
there's no qualifying evidence (the common case for a new student), no
extra field is sent and the Tutor behaves exactly as it did before Section
B existed.

- **MCQ / True-False** are graded deterministically, client-side, in
  `js/baa-assessment.js` — no AI call, no cost, no latency.
- **Short answer / long answer / math / step-based / written response**
  are graded by `api/evaluate.js`, a second Vercel Edge Function that
  calls Gemini (same model and key as `api/chat.js`) and returns a
  structured JSON evaluation (score, correctness, errors, missing
  concepts, confidence, human-review flag) — never a bare paragraph.
- **Learning Evidence, Learning Memory, and Mistake Archeology are
  evidence-gated**: a concept needs at least 3 answered questions before
  BAA will say "mastered" / "needs revision" / anything at all — below
  that it says "Not enough evidence yet." A repeated error type on the
  same concept (3+ times) surfaces as a "possible misconception," never
  a diagnosis.
- **Storage is browser-local (`localStorage`) and clearly labeled as
  private testing data** — see `DEPLOYMENT.md` → "Section B data
  storage" for how this maps to a real database later.
- `student-os.html`'s Learning Profile tabs (Mastery / Mistake
  Archeology / Learning Outcome) read from the same data layer, so a
  completed assessment shows up there automatically — Section A's UI
  and Section B's engine share one source of truth.

See `DEPLOYMENT.md` for how to deploy `api/evaluate.js` alongside
`api/chat.js`, and the final report delivered with this build for an
honest, component-by-component status (functional / partial / frontend-
only / future).

## AI Tutor backend

`student-os.html`'s AI Tutor is wired to a real, production-ready Gemini
backend rather than calling Google directly from the browser (which would
expose an API key). The backend lives in `api/chat.js` and deploys separately
to Vercel as a serverless Edge Function.

```
api/chat.js       — Vercel Edge Function: validates input, rate-limits,
                     retries transient failures, streams the model's reply
package.json       — minimal project manifest (no build step)
vercel.json        — zero-config Vercel project file
.env.example        — env vars the function needs (GEMINI_API_KEY, ALLOWED_ORIGIN)
```

Full step-by-step setup, environment variables, and a testing checklist are
in **[DEPLOYMENT.md](./DEPLOYMENT.md)** — start there once you're ready to
make the tutor live.

## Section C — Learning Intelligence + AI Planner

`js/baa-intelligence.js` and `js/baa-planner.js`, plus the new **AI Planner**
world and enriched **Learning Profile** tab in `student-os.html`, implement
Section C on top of Section A + B without a second evidence store:

```
Section B evidence (attempts, evidence rows, learningMemory, mistakePatterns)
        │  (read-only — Section C adds no parallel store)
        ▼
js/baa-intelligence.js  — refines Section B's concept status into a richer,
                           still evidence-gated state; adds trend, evidence
                           confidence, and an explainable "why" per concept
        │
        ▼
js/baa-planner.js       — turns Learning Intelligence output + goals +
                           upcoming assessments + available time into a
                           realistic, time-boxed daily plan; adapts as new
                           evidence and missed tasks come in
        │
        ▼
student-os.html          — "AI Planner" world (new) + "Learning Profile"
                            (Mastery tab enriched with states/trend/why)
```

### Concept learning states

Section B already gates every judgement behind a minimum of 3 answered
questions per concept, and computes a base status (`mastered` / `learning`
/ `needs_revision` / `insufficient_evidence`) from the correctness rate
over the last 5 evidence rows. **Section C does not change either of those
numbers.** It adds one optional refinement pass, always at or below
Section B's base bar, never above it:

- `mastered` splits into 🟢 **Mastered** (recent evidence includes at
  least 2 different question difficulties/questions AND the single most
  recent answer was correct) vs 🔵 **Strong** (clears Section B's mastered
  bar but not that stricter one — still real mastery evidence, just not
  the highest-confidence label).
- `needs_revision` splits into 🟠 **Needs Revision** vs 🔴 **Struggling**
  (recent correctness rate ≤ 25%).
- `learning` (🟡) and `insufficient_evidence` (⚪ **Not Enough Evidence**)
  are passed through unchanged from Section B.

Every state ships with a **evidence confidence** (`high` / `medium` /
`low` / `insufficient_evidence` — confidence in the *inference*, never
the student's emotional confidence) and a **trend** (`improving` /
`declining` / `stable` / `insufficient_evidence`, requiring at least 4
evidence points, computed by comparing the older half of a concept's
evidence to the newer half — never from a single assessment).

### Explainability

Every state and every Planner task carries a `why` string built from real
numbers pulled straight from Section B's evidence rows (e.g. *"Your last 4
answers on this concept show 1/4 correct. Repeated difficulty pattern:
inverse operation error."*) — never a bare "AI recommends this." The same
`BAAIntelligence.whyForConcept()` function backs both the Learning Profile
tab and the Planner's "Why this task?" line, so there's one source of
truth for explanations, not two.

### Mistake intelligence

`getMistakeIntelligence()` reads Section B's `mistakePatterns` unchanged
(same 3-occurrence threshold for "possible misconception") and adds one
new signal: whether the same error type has recurred in that concept's
*most recent* evidence (`improving` / `not_improving` /
`insufficient_evidence`, needing 4+ evidence points on the concept). This
lets the Mistake Archeology tab say "hasn't shown up recently — looking
better" instead of leaving every confirmed pattern permanently flagged.

### AI Planner

`js/baa-planner.js` keeps its own small, clearly-labeled local-testing
store (`baa_section_c_planner_v1` — goals, time preference, upcoming
assessments, and task history) but **reads** all learning evidence live
from `BAAIntelligence` / `BAAAssessment` rather than caching a copy, so a
newly-completed assessment changes tomorrow's plan without any extra
sync step.

- **Task generation**: candidate tasks come from weak concepts (`practice`),
  confirmed-and-not-yet-improving mistake patterns (`review_mistake`),
  concepts still `learning` with a matching upcoming assessment (`learn`),
  and concepts due for a spaced check after a completed practice task
  (`reassessment`, requires ≥1 day since the practice task was completed —
  not immediate). Each candidate carries a plain-language priority
  (`high`/`medium`/`low`) driven by understandable factors (struggling >
  needs-revision, an upcoming assessment in the same subject, a matching
  student goal) — never an opaque numeric score.
- **Time budget**: candidates are sorted by priority and packed into the
  student's chosen available-time-per-day (15/30/45/60 min), trimming a
  task's minutes to fit rather than blowing the budget, and dropping a
  task entirely (for today) if fewer than 8 minutes remain — a small,
  realistic plan, not an unrealistic pile-up.
- **Missed-task rebalancing**: on every Planner load, `checkAndRebalanceMissedTasks()`
  finds tasks still `pending` from a past day. It never just slides them
  to today — it re-checks the underlying concept's *current* state first:
  if evidence shows the concept no longer needs it, the task is marked
  `cancelled` (with a reason, kept in history — never silently deleted);
  otherwise it's marked `missed` and folded into today's plan alongside
  new candidates, still respecting the same time budget. The UI shows a
  supportive banner ("Yesterday's plan wasn't fully completed — that's
  alright... I've adjusted today's plan"), never "you failed your plan."
- **Task completion ≠ mastery**: `completeTask()` only records completion
  and a history entry. It never writes to Section B's `learningMemory` —
  mastery is decided exclusively by real assessment evidence, the same
  way it always was in Section B.
- **Real connections, no dead buttons**: a `practice`/`reassessment` task
  looks up a real catalog assessment that actually contains the concept
  (`findAssessmentForConcept()`) and deep-links to
  `assessment.html?start=<id>` (new query-param support added to
  `assessment.html`), which auto-opens that assessment. If this small
  testing question bank has no matching assessment yet, the button is
  honestly disabled ("Not available yet") instead of pretending to work.
  A `review_mistake`/`learn` task opens the AI Tutor and **prefills** (does
  not auto-send) a short, bounded prompt — concept + the specific mistake
  type, never the student's full history — so the student reviews it
  before sending (student stays in control).
- **Student control**: every pending task has Complete / Skip / Reschedule
  buttons; nothing is forced.

### What Section C intentionally does NOT do

No production database (still `localStorage`, clearly labeled
`LOCAL_BROWSER_STORAGE_TESTING_ONLY`, same as Section B). No Parent/Teacher
OS (Section D), no full safety/trust system (Section E), no offline system
(Section F), no production backend/auth (Section G). No claim of
scientifically-validated spaced repetition — the 1-day reassessment gap is
a documented, simple rule, not a research claim. No retention claims
beyond what evidence supports — the Planner shows immediate post-practice
performance as just that, not "retention," unless a later, separate
reassessment provides real retention evidence.

See the Section C final report (delivered alongside this build) for a
component-by-component functional status and the tests that were and
weren't possible to run.

## Deploying to GitHub Pages (frontend)

1. Create a new repo (or use an existing one) and push everything to the root of the `main` branch:
   ```bash
   git init
   git add -A
   git commit -m "Initial BAA OS upload"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, select **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Save. GitHub will publish at `https://<your-username>.github.io/<repo-name>/`.
5. Confirm `index.html` loads first and that navigating Home → Student OS → Knowledge Universe → Mathematics World works with the published URL.
6. For the AI Tutor to actually respond, also deploy `api/chat.js` to Vercel and point `CHAT_API_URL` in `student-os.html` at it — see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Notes

- The four HTML pages need no `npm install` or build step — everything runs client-side.
- Keep all four files at the same directory level if you add more pages later, or update the relative links if you introduce subfolders.
- `.gitignore` keeps `.env*` and `.vercel` out of git — never commit a real API key.
