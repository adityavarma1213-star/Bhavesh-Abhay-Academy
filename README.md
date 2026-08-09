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

## Section D — Parent OS + Teacher OS (single-student private testing)

`parent-os.html` and `teacher-os.html` are new, standalone pages that read
Section B's evidence and Section C's Learning Intelligence/Planner data —
**read-only against B/C**; neither file was modified to build Section D.

```
Section B evidence + Section C intelligence/planner (read-only)
        │
        ▼
parent-os.html   — plain-language progress, strengths, areas needing
                    attention, recent assessment results, today's plan,
                    and a "try asking..." home-support suggestion per
                    weak concept (generated phrasing around real data,
                    never a fabricated stat)
teacher-os.html  — Learning Profile + Intelligence table, assessment
                    history, Mistake Archeology, a summary + link to the
                    existing `teacher-review.html` queue (not duplicated),
                    Planner, suggested intervention links, and a new
                    small teacher-notes feature
```

Both pages are explicitly labeled **"🧪 Single-Student Private Testing"**
in the UI. There is one learner, on one device, in this build — no class
roster, no multiple students, no averages or comparisons. That isn't a
missing feature here; building fake ones was explicitly out of scope, and
a real multi-student system needs real accounts and a database
(Section G), not built yet.

- **Teacher notes** (`teacher-os.html`) is the one genuinely new piece of
  storage Section D adds — `baa_section_d_teacher_notes_v1`, following the
  same naming convention as Section B's `baa_section_b_data_v1` and Section
  C's `baa_section_c_planner_v1`. It's additive only: a free-text note list
  scoped to this page, with no effect on B/C data.
- **Existing Human Review is linked, not rebuilt.** `teacher-os.html` shows
  a pending-count summary from `BAAAssessment.getTeacherReviewQueue()` and
  links to the existing `teacher-review.html` for the actual accept/edit/
  reject actions — Section B's review logic was left untouched.
- **Intervention links are real or honestly absent.** Both pages look up a
  real matching assessment for a weak concept via the existing
  `BAAAssessmentCatalog`/`BAAGetQuestion` globals; if this testing build's
  small question bank has no matching assessment, the link is omitted
  rather than pointing anywhere fake.
- Access is a discreet "Parent View / Teacher View" link at the bottom of
  `student-os.html` — not part of the student's play surface, and not
  gated behind a real login yet (no accounts exist in this build).

See `test/run-section-d-smoke.js` for the automated check of every data
call both pages make (empty-state and populated-evidence paths), and the
Section D final report delivered alongside this build for full status.

## Section G2 — Account creation & login (client-side, local testing only)

Additive to Section G2.1's schema (see `SCHEMA.md` §15 and
`db/schema.sql`'s "1a. AUTHENTICATION" block, both unchanged by G2).
G2.1 defined `credentials` and `auth_sessions` as design-only tables
with no code touching them; G2 fills that gap with real, working
signup/login/logout, still with no live database (see `SCHEMA.md`
§12) — so the storage is localStorage, exactly like Sections B/C/D.

```
index.html (signup/login modal)
        │
        ▼
js/data-access/repositories/accountRepository.js  — signUp / logIn /
                                                      logOut / getCurrentSession
        │
        ▼
js/data-access/adapters/localStorageAdapter.js     — new accounts/session
                                                      storage methods
        │
        ▼
localStorage key: baa_section_g2_accounts_v1        (users / credentials /
                                                      auth_sessions, shaped
                                                      after db/schema.sql)
```

- **Passwords are never stored in plaintext.** Each password is hashed
  with a per-user random salt (SHA-256) before being written to
  `credentials.password_hash`, encoded as `salt:hash` in that single
  column. The `algorithm` value is honestly recorded as
  `sha256-salted-local-only` — **not** `argon2id` (`db/schema.sql`'s
  placeholder default) — because that's what actually runs. See
  `accountRepository.js`'s header for why this still isn't
  production-secure: there is no server to keep any of it secret from
  the browser it runs in. A real, network-verified auth backend is a
  Section G4 concern.
- **Session tokens follow the same rule G2.1 designed for:** only a
  hash of the token (`token_hash`) is stored in the sessions list.
  The raw token needed to recognize "this browser is still logged in"
  lives in a separate localStorage key, exactly as inspectable as
  everything else in this local-testing build.
- **Sessions are soft-revoked, never deleted** (`revoked_at`), matching
  the lifecycle pattern G1/G2.1 already use elsewhere in the schema.
- **What G2 intentionally does not do:** no role assignment or
  permission checks (`user_roles` untouched — Section G3), no page
  gating (any page can still be opened directly by URL, same as
  before), and no change to how the existing single-learner
  repositories (learner/assessment/evidence/planner/teacherReview/
  teacherNotes) resolve data — they still use the one local-learner
  slot exactly as before (see `js/data-access/README.md`).

See `test/run-g2-tests.js` for signup validation, duplicate-email
handling, login success/failure, session round-trip, expiry, logout,
and a check that Sections A–D's own localStorage keys are untouched.

## Section G3 — Authorization, roles & access control (client-side, local testing only)

Additive to Section G2. Fills the gap G1/G2 both flagged and left
open: `user_roles`, `parent_learner`, `teacher_learner`, `classes`,
and `class_members` (defined by G1's schema, `SCHEMA.md` §1/§3 —
"foundation for G2/G3, not implemented by G1") were untouched until
now.

```
js/data-access/repositories/authorizationRepository.js
        — assignRole / revokeRole / getRoles / hasRole
        — linkParentToLearner / revokeParentLink
        — linkTeacherToLearner / revokeTeacherLink
        — createClass / addClassMember / removeClassMember
        — canAccessLearner / canAccessClass
        │
        ▼
js/data-access/adapters/localStorageAdapter.js  — new
                                                   getAuthorizationStore /
                                                   saveAuthorizationStore
        │
        ▼
localStorage key: baa_section_g3_authorization_v1   (own new key — does
                                                       not touch or
                                                       reshape the G2
                                                       accounts key)
```

- **Roles.** Only the four roles `db/schema.sql`'s `user_roles` CHECK
  constraint documents — `student`, `parent`, `teacher`, `admin` — can
  be assigned; anything else is rejected, never silently invented.
  Assigning an already-held role is idempotent (matches
  `user_roles`' own `PRIMARY KEY (user_id, role)`). `user_roles` has
  no `revoked_at`/`status` column in the schema, so `revokeRole`
  removes the row — that's the schema's own design, not a shortcut
  taken here.
- **Relationships.** `parent_learner` and `teacher_learner` links use
  the same soft-revoke pattern (`status` + `revoked_at`) those tables
  already define in `db/schema.sql`. `classes`/`class_members` follow
  the same pattern with `status`/`removed_at`.
- **Access decisions.** `canAccessLearner(userId, learnerId, learnerOwnerUserId)`
  is the one function that decides "can this user see this learner's
  data?" — it only ever returns `allowed: true` when it can point to
  a real row: an `admin` role, a `learners.user_id` self-match plus
  the `student` role, an active `parent_learner` row, an active
  `teacher_learner` row, or active class ownership + membership.
  Everything else is denied with an explicit `reason`, never a
  default allow. `canAccessClass(userId, classId)` answers the same
  question for a class roster (owning teacher or admin only).
- **What G3 intentionally does not do:** it does not gate page
  navigation or add route middleware to `index.html` /
  `student-os.html` / `teacher-os.html` / `parent-os.html` /
  `assessment.html` / `teacher-review.html` — those pages can still
  be opened directly by URL, same as before G3. It does not rewire
  the learner/assessment/evidence/planner/teacherReview/teacherNotes
  repositories to take an authenticated `learnerId` (still G2's own
  documented gap). And, like every other section here, it is **not
  production-secure**: every check runs client-side against
  localStorage, which anyone with devtools access to this browser can
  read or rewrite. A real, server-enforced authorization layer is a
  Section G4 concern — see `authorizationRepository.js`'s file header
  for the full honesty notes.

See `test/run-g3-tests.js` for role assignment/revocation, granted
and denied access across parent/teacher/class/self/admin paths,
revocation removing access, the new adapter methods, the
`DatabaseAdapter` stub honestly throwing, and a check that the G2
accounts store and Sections A–D's own localStorage keys are
untouched.

## Section E — AI Trust, Privacy & Safety (client-side foundation)

New page `trust-privacy.html`, plus `js/baa-trust.js` and
`js/baa-wellbeing.js`, implement the safety/trust cluster (blueprint
Modules 37, 38, 39, 54, 55, 59, 60) on top of Sections A–D and G1–G3,
without rebuilding any of them. See `SECTION-E-COVERAGE-MATRIX.md` for
the full requirement-by-requirement audit and `SECTION-E-GAP-REGISTER.md`
for an honest status flag on every item.

```
Section B teacherReviews (read/extend, not duplicated)
        │
        ▼
js/baa-assessment.js  — requestReevaluation() lets a student/parent open
                         a review on ANY graded question, not just
                         AI-flagged ones; submitTeacherReview() now keeps
                         decisionHistory[] so a second decision never
                         silently erases the first
        │
        ▼
js/baa-trust.js       — NEW store (baa_section_e_trust_v1): data
                         inventory, retention text, local consent
                         acknowledgement, activity log, export, fresh
                         start (preserves teacherReviews), scoped
                         deletion
js/baa-wellbeing.js   — NEW store (baa_section_e_wellbeing_prefs_v1):
                         session-length break reminders, off by default
                         control, shared no-shame copy helpers
        │
        ▼
trust-privacy.html    — the Module 37 UI for all of the above, linked
                         from student-os.html
```

- **Consent is a local acknowledgement, not verified consent.** This
  build has no verified account/parent-identity system, so
  `recordConsentAcknowledgement()` is explicitly documented — in the UI
  and in its own code — as NOT a legally-binding record. A real,
  verified parental-consent flow needs a real backend (Section G4+).
- **Appeals build on Section B's existing review queue.** A question
  the AI never flagged for review can still be appealed
  (`requestReevaluation()`); reopening an already-decided review pushes
  the prior decision into `decisionHistory` before it can be
  overwritten — this closes a real gap where a second teacher decision
  would have silently erased the first one. The original AI evaluation
  stays intact through every round.
- **Fresh Start never destroys review/appeal history.** It archives and
  clears active attempts/evidence/planner tasks, but `teacherReviews`
  (every human decision, and now every appeal) is carried forward
  untouched — that record is exactly what Module 39/55 says must not be
  silently destroyed.
- **Deletion is honestly scoped.** `this_app_only` clears Section
  B/C/D's stores; `everything` additionally clears the account/roles
  stores from G2/G3 — both run entirely client-side, immediately, on
  this device, because there is no server copy in this build to
  separately purge. That limitation is stated on the page itself, not
  buried in code comments.
- **Uploaded images and voice/TTS audio were audited, not changed** —
  `js/image.js` and `api/speak.js` already never write either to any
  BAA store; Section E's job here was verifying and documenting that,
  not building new protection for something that was already safe.
- **No second explainability engine.** Concept-state/trend/planner
  explanations (`BAAIntelligence.whyForConcept()`) and per-question AI
  evaluation explanations (`assessment.html`) were already real and
  evidence-based from Sections B/C — Section E reused them and did not
  duplicate them. Two blueprint items — AI-driven career
  recommendations and "AI Guardian" alerts — don't exist as features
  anywhere in this codebase yet, so they're honestly marked not-yet-built
  rather than given a fabricated explanation.
- **Break reminders are a suggestion, never a lock.** Off by default
  behavior is respected, the same message never repeats before the next
  interval, and the shared copy helpers
  (`supportiveMissedTaskCopy()`/`supportiveLowScoreCopy()`) are tested
  against a banned shame/comparison-phrase list.

See `test/run-e-tests.js` for the dedicated Section E suite (consent,
data inventory, retention honesty, export, fresh start, deletion —
both scopes, the full appeal/decision-history flow, and wellbeing
pacing), and a regression check that Section E's new keys never touch
Sections A–D's or G2/G3's existing localStorage keys.

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

## Section G2.1 — Authentication schema (design only)

Additive to Section G1 (see `SCHEMA.md` and `db/schema.sql`). G1 defined
`users`/`user_roles` as identity foundations but never defined where a
credential or login session would live — G2.1 adds exactly that: a
`credentials` table (password hash only, never plaintext) and an
`auth_sessions` table (token hash only, never a raw token). Like every
other table in `db/schema.sql`, these are **schema/design only** — no
live database is connected, and nothing in this codebase creates,
reads, or writes to them. No signup/login UI, no session code, and no
password hashing are implemented by G2.1; see `SCHEMA.md` section 15
for the full scope and what's intentionally left for later G2
checkpoints and G3/G4. Validated by `test/run-g2.1-tests.js`.
