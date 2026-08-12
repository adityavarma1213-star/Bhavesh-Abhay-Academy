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

## Module 8 — AI Homework Scanner (M8-A1 → M8-C)

The Homework Scanner is implemented as a dedicated student-facing page and is developed in isolated production checkpoints.

- **M8-A1 — Text foundation:** dedicated Homework Scanner page and text-only submission flow.
- **M8-A2 — Image attachment:** PNG/JPEG/WEBP photo selection, preview and browser-side compression. Image bytes are held only in memory during selection and are not persisted. The current evaluation endpoint records that a photo exists but does **not** evaluate its pixels.
- **M8-B1 — Evaluation endpoint:** dedicated server-side homework evaluation endpoint using the existing Gemini/Vercel pattern, with server-side input validation, rate limiting/retry handling and no client-side API secret.
- **M8-B2 — Structured evaluation:** schema-versioned evaluation result, confidence and human-review flags.
- **M8-C — PDF support:** PDF.js extracts selectable text in the browser, with a 20 MB / 40-page limit and an 8,000-character extraction cap. Scanned/image-only PDFs are rejected honestly; OCR and image-content evaluation are not claimed.
- **M8-C hardening:** common image/PDF attachment metadata is now shaped through `js/baa-homework-attachment-base.js`; the evaluation endpoint re-validates extracted text server-side before sending it to Gemini.

**Storage/privacy:** the current implementation uses browser-local testing storage. Raw image and PDF bytes are not persisted by the Homework Scanner. PDF text extracted for evaluation is stored as submission text under the existing local testing model.

**Deferred from M8-C:** broader image-content/OCR evaluation is not claimed by M8-C; Learning Memory / Mistake Archeology is now covered by M8-D2 below.

**Files added/changed for M8-C hardening:** `js/baa-homework-attachment-base.js`, `js/baa-homework-image.js`, `js/baa-homework-pdf.js`, `js/baa-homework.js`, `api/evaluate-homework.js`, `homework-scanner.html`, `README.md`, `DEPLOYMENT.md`, `SECTION-M8-STATUS.md`, and `test/run-m8-c-hardening-tests.js`.

## Module 8 — M8-D1 Teacher Review Integration

The Homework Scanner now integrates with the existing `teacher-review.html` human-review surface. Evaluations marked `humanReviewRequired` create a dedicated homework review record. Teachers can accept, edit, or reject the AI evaluation. The original AI evaluation is preserved separately and prior human decisions are retained in `decisionHistory`.

## Module 8 — M8-D2 Learning Memory / Mistake Archeology Integration

M8-D2 connects explicit, evidence-gated homework learning signals to the existing Section B Learning Memory / Mistake Archeology engine. The AI evaluator may return up to five concept-level `learningSignals`; only high-confidence, non-uncertain signals are admitted as Section B evidence. They are stored with `evidenceType: homework_evaluation` and `source: module_8_homework_scanner`, then run through the existing Learning Memory and Mistake Archeology rules. A single homework submission cannot claim mastery: the existing minimum-evidence gate remains in force. Repeated integration is idempotent, and the Homework Scanner records whether integration succeeded, produced no admissible signal, or was unavailable.

**M8-D2 files changed:** `api/evaluate-homework.js`, `js/baa-homework.js`, `js/baa-assessment.js`, `js/data-access/repositories/evidenceRepository.js`, `homework-scanner.html`, and `test/run-m8-d2-tests.js`.

**Still deferred:** image-pixel evaluation/OCR and the later production backend/database gates.

This remains browser-local/private-testing storage; it is not a production server-side teacher account system.


## Module 10 — AI Confidence Meter (M10-C1)
M10-C1 adds an evidence-backed confidence meter to the Student OS Learning Profile. It reports categorical evidence confidence (`high`, `medium`, `low`, or `insufficient_evidence`) from real Learning Memory evidence. It deliberately does not fabricate a numeric mastery percentage. M10-C1 does not claim emotional/self-confidence measurement or live production telemetry.

Files added: `test/run-m10-c1-tests.js`.
Files updated: `js/baa-intelligence.js`, `student-os.html`, `README.md`.


## Module 1 — AI Mode (M1-A1)
M1-A1 adds a real server-side AI-directed learning-path endpoint and Student OS planner control. It uses only bounded learner goals, Learning Memory concept states, evidence confidence/counts, available study time, and upcoming assessments. It does not implement Custom Mode, Hybrid Mode, production persistence, teacher routing, or claim Module 1 is fully complete.

Files added: `api/ai-mode.js`, `js/baa-ai-mode.js`, `test/run-m1-a1-tests.js`.
Files updated: `student-os.html`, `README.md`.


## Module 1 — AI Mode (M1-A2)
M1-A2 adds adaptive regeneration of an existing AI Mode learning path using the latest bounded Learning Memory evidence. The student can ask AI Mode to adapt the previous plan rather than blindly repeating it. The checkpoint does not implement Custom Mode, Hybrid Mode, production persistence, or claim Module 1 is complete.

Files added: `test/run-m1-a2-tests.js`.
Files updated: `api/ai-mode.js`, `js/baa-ai-mode.js`, `student-os.html`, `README.md`.

## Module 2 — Custom / Individual Mode (Current checkpoint)
This checkpoint adds a student-controlled learning path in Student OS. The student can add, reorder, complete, undo, and remove learning steps with a chosen type and time estimate. The path is stored in browser-local testing storage with a schema version. Custom Mode does not call AI to reorder the student's choices, does not alter AI Mode plans, and does not claim Hybrid Mode, teacher routing, authentication, or production persistence.

Files added: `js/baa-custom-mode.js`, `test/run-m2-custom-mode-tests.js`.
Files updated: `student-os.html`, `README.md`.


### M2 Custom Mode hardening
- Corrected normalization of corrupted stored paths so a valid step retains its own ID and completion state even when an earlier stored step is invalid.
- Added a regression test for this corruption case.


## Module 3 — Hybrid Mode (M3-A)
M3-A adds the Hybrid Mode foundation: a student can combine an existing AI Mode plan with their saved Custom Mode path into one explicitly sourced Hybrid path. This checkpoint does not implement AI/student conflict resolution, automatic weighting, adaptive Hybrid Mode, or server persistence.

Files added: `js/baa-hybrid-mode.js`, `test/run-m3-a-tests.js`.
Files updated: `js/baa-ai-mode.js`, `student-os.html`, `README.md`.


## Module 3 — Hybrid Mode (M3-B)
M3-B adds student control over the combined Hybrid path. Students can include/exclude individual AI or Custom steps and save the adjusted path. This checkpoint does not implement automatic AI/student conflict resolution, weighting, adaptive Hybrid decisions, or server persistence.

Files added: `test/run-m3-b-tests.js`.
Files updated: `js/baa-hybrid-mode.js`, `student-os.html`, `README.md`.


## Module 3 — Hybrid Mode (M3-C)
M3-C adds explicit Hybrid priority behavior. The student can choose Balanced (keep both conflicting same-title steps and decide), Student Priority (student-created step wins), or AI Priority (AI step wins). This checkpoint uses deterministic rules only; it does not invent evidence, add a new AI endpoint, or add server persistence.

Files added: `test/run-m3-c-tests.js`.
Files updated: `js/baa-hybrid-mode.js`, `student-os.html`, `README.md`.


## Module 3 — Hybrid Mode (M3-D)
M3-D completes the final Hybrid integration/hardening checkpoint. It adds a safe reset action and a real Hybrid summary (active steps, AI steps, student steps, and active minutes), with corruption recovery and limit coverage. M3 remains client-side/localStorage at this stage; server/database persistence is outside M3-D.

Files added: `test/run-m3-d-tests.js`, `SECTION-M3-STATUS.md`.
Files updated: `js/baa-hybrid-mode.js`, `student-os.html`, `README.md`.


## Module 4 — AI Tutor (M4-A)
M4-A hardens the existing AI Tutor connection without rebuilding the Tutor. Temporary frontend/backend debug logging was removed, while the server-side Gemini key, input limits, image validation, CORS configuration, rate limiting, retries, timeout, and Section B learning-context connection remain intact.

Files added: `test/run-m4-a-tests.js`, `SECTION-M4-STATUS.md`.
Files updated: `api/chat.js`, `student-os.html`, `README.md`.

## Module 4 — AI Tutor (M4-B)
M4-B hardens the large `student-os.html` Tutor implementation: the SSE event processor is explicitly retained, decoded chunks are buffered correctly, the final unterminated event is flushed, and streamed Markdown is sanitized before DOM insertion. Existing backend, model, and Learning Context wiring are retained; no M5 functionality is introduced.

Files added: `test/run-m4-b-tests.js`.
Files updated: `student-os.html`, `README.md`, `SECTION-M4-STATUS.md`.

## Module 4 — AI Tutor (M4-C)
M4-C makes Tutor conversation recovery explicit: saved text history is strictly validated and bounded, restored safely on reload, assistant messages use the existing Markdown sanitizer, and a Clear saved conversation control is provided. Image bytes are excluded from persistence. No new AI endpoint or backend behavior is introduced.

Files added: `test/run-m4-c-tests.js`.
Files updated: `student-os.html`, `README.md`, `SECTION-M4-STATUS.md`.

## Module 4 — AI Tutor (M4-D)
M4-D is the final implementation/hardening pass for the Tutor conversation layer. Persistence is schema-versioned and migration-safe, storage failures are surfaced honestly, text-only conversation export/import is available, and clearing a saved conversation is confirmable and keyboard accessible. No image bytes are persisted/exported, and no new AI endpoint or model is introduced.

Files added: `test/run-m4-d-tests.js`.
Files updated: `student-os.html`, `README.md`, `SECTION-M4-STATUS.md`.

## Module 5 — AI Mentor Chat
M5 implements the blueprint's AI Mentor Chat as a distinct academic-profile conversational assistant focused on guidance and motivation. It reuses the existing secure chat backend through an explicit `mentor` mode, uses available assessment learning evidence when relevant, keeps a bounded schema-versioned conversation locally, and applies professional safety boundaries. It does not replace the AI Tutor and does not introduce a second AI API endpoint.

Files added: `test/run-m5-tests.js`.
Files updated: `student-os.html`, `api/chat.js`, `README.md`, `SECTION-M5-STATUS.md`.

## Module 6 — Smart Assessment System
M6 adds a real adaptive assessment layer using only questions already present in the BAA question bank. It ranks recent Learning Evidence by concept performance, prioritizes weaker concepts, varies question type/difficulty where possible, and presents a real runnable assessment. With no evidence yet, it uses a small diagnostic starter mix. No fake questions or invented scores are generated.

Files updated: `js/baa-assessment.js`, `assessment.html`, `README.md`, `SECTION-M6-STATUS.md`.
Files added: `test/run-m6-tests.js`.

## Module 7 — Transparent AI Evaluation
M7 adds structured rubric output to subjective AI evaluation, including criterion-level scores and evidence notes, confidence, human-review flags, and student-visible “How this was marked” rationale. The original AI evaluation remains preserved when a human reviewer later accepts, edits, or rejects it. Unreadable AI output remains unscored and reviewable.

Files added: `test/run-m7-tests.js`.
Files updated: `api/evaluate.js`, `js/baa-assessment.js`, `assessment.html`, `README.md`, `SECTION-M7-STATUS.md`.

## Module 9 — AI Learning Memory
M9 makes the academic profile a persistent, schema-versioned evidence-derived summary of historical strengths, weaknesses, and learning habits. It updates from completed assessment/homework evidence and is surfaced in the Learning Profile. No personality, health, or psychological diagnosis is inferred.

Files added: `test/run-m9-tests.js`.
Files updated: `js/baa-assessment.js`, `student-os.html`, `README.md`, `SECTION-M9-STATUS.md`.

## Module 11 — AI Planner
M11 provides an evidence-driven living planner with daily, weekly, and monthly views. It uses learning states, mistake patterns, goals, available time, and upcoming assessments to prioritize tasks, while keeping completion and rescheduling under student control.

Files added: `test/run-m11-tests.js`.
Files updated: `js/baa-planner.js`, `student-os.html`, `README.md`, `SECTION-M11-STATUS.md`.

## Module 12 — AI Guardian
M12 adds evidence-based academic early-support signals for repeated low performance, pending human review, and missed planner tasks. Alerts are explainable, acknowledgeable, and explicitly scoped away from mental-health/personality diagnosis.

Files added: `js/baa-guardian.js`, `test/run-m12-tests.js`.
Files updated: `student-os.html`, `README.md`, `SECTION-M12-STATUS.md`.

## Module 13 — AI Prediction Engine
M13 provides bounded academic forecasts from real assessment and concept evidence: readiness estimate, recent grade trajectory, milestone outlook, and evidence/confidence context. It refuses to forecast when evidence is insufficient and labels predictions as estimates rather than guarantees.

Files added: `js/baa-prediction.js`, `test/run-m13-tests.js`.
Files updated: `student-os.html`, `README.md`, `SECTION-M13-STATUS.md`.

## Module 14 — Parent Dashboard
M14 extends the existing parent-facing dashboard with evidence-derived academic profile, bounded academic forecast, and Guardian support signals while preserving the project's single-student private-testing scope. It explicitly avoids health/personality/family inference.

Files added: `test/run-m14-tests.js`.
Files updated: `parent-os.html`, `README.md`, `SECTION-M14-STATUS.md`.

## Module 15 — Parent Approval Mode
M15 adds versioned parent governance controls for AI Tutor, AI Mentor, and Planner use, including a validated daily study-minute cap. The controls are enforced by the corresponding frontend/planner paths and are explicitly local/private-testing governance, not a production security boundary.

Files added: `js/baa-parent-approval.js`, `test/run-m15-tests.js`.
Files updated: `student-os.html`, `js/baa-planner.js`, `parent-os.html`, `README.md`, `SECTION-M15-STATUS.md`.

## Module 16 — Teacher Recommendation System
M16 generates differentiated teacher assignment recommendations from real Learning Intelligence states, prioritizing struggling/needs-revision concepts and linking only to real available assessments. Recommendations remain suggestions; a teacher makes the final assignment decision.

Files added: `js/baa-teacher-recommendation.js`, `test/run-m16-tests.js`.
Files updated: `teacher-os.html`, `README.md`, `SECTION-M16-STATUS.md`.

## Module 17 — Teacher Analytics
M17 adds evidence-derived teacher analytics plus a reusable multi-student aggregation adapter. The current single-student private-testing build displays concept analytics but does not fabricate a class heatmap. Full class-wide analytics remains pending a real multi-student data source.

Files added: `js/baa-teacher-analytics.js`, `test/run-m17-tests.js`.
Files updated: `teacher-os.html`, `README.md`, `SECTION-M17-STATUS.md`.

## Module 18 — School Calendar Integration
M18 adds a local school-calendar layer for explicit exams, deadlines, holidays, and school events. The Planner reads calendar context and avoids automatically generating daily study tasks on explicitly entered holidays.

Files added: `js/baa-school-calendar.js`, `test/run-m18-tests.js`.
Files updated: `js/baa-planner.js`, `student-os.html`, `README.md`, `SECTION-M18-STATUS.md`.

## Module 19 — AI Learning Passport
M19 adds a portable, schema-versioned academic passport built from real evidence-backed competencies and completed assessments, with JSON export. It is explicitly a local testing record, not an external credential.

Files added: `js/baa-learning-passport.js`, `test/run-m19-tests.js`.
Files updated: `student-os.html`, `README.md`, `SECTION-M19-STATUS.md`.

## Module 20 — AI Career & Future Planning Center
M20 replaces the static career preview with exploratory career tracks, evidence-aligned skills, and next skills to explore based on the student's academic profile. It explicitly avoids guaranteed job, salary, admission, or personal-future predictions.

Files added: `js/baa-career.js`, `test/run-m20-tests.js`.
Files updated: `student-os.html`, `README.md`, `SECTION-M20-STATUS.md`.

## Modules 21–23 — Practice, Weakness & Strength Engines
M21 adds evidence-prioritized practice selection from the real question bank. M22 exposes repeated evidence-based weakness signals. M23 exposes evidence-backed strength recognition. These modules do not invent questions, scores, or psychological diagnoses.

Files added: `js/baa-practice.js`, `js/baa-weakness.js`, `js/baa-strength.js`, `test/run-m21-23-tests.js`.

## Modules 24–25 — Revision & Goal Tracking
M24 adds evidence-state-based revision intervals and due signals. M25 formalizes the existing Planner goal store as an evidence-linked goal tracker. Neither invents completion or mastery percentages.

Files added: `js/baa-revision.js`, `js/baa-goals.js`, `test/run-m24-25-tests.js`.

## Module 26 — AI Notes Generator
M26 creates a factual, reviewable teacher-note draft from existing BAA academic evidence. It does not call an AI endpoint, invent facts, or auto-save. The teacher explicitly reviews the draft before deciding whether to save/share it.

Files added: `js/baa-notes-generator.js`, `test/run-m26-tests.js`.
Files updated: `teacher-os.html`, `README.md`, `SECTION-M26-STATUS.md`.

## Module 27 — AI Learning Resources
M27 adds evidence-backed multimodal learning-resource recommendations. The student may explicitly choose a preferred format (visual, video, interactive, or practice). BAA does not infer or diagnose a fixed "learning style." External destinations are search targets, not claims that every returned resource is BAA-validated.

Files added: `js/baa-learning-resources.js`, `test/run-m27-tests.js`.
Files updated: `student-os.html`, `README.md`, `SECTION-M27-STATUS.md`.

## Module 28 — AI Explain Like... Mode
M28 adds student-controlled explanation styles to the existing AI Tutor. Modes are bounded and backend-validated; analogy modes explicitly distinguish analogies from literal facts.

Files added: `test/run-m28-tests.js`, `SECTION-M28-STATUS.md`.
Files updated: `student-os.html`, `api/chat.js`, `README.md`.

## Module 29 — AI Learning Paths
M29 creates a transparent sequential, node-based learning journey from real BAA concept evidence. It does not invent a syllabus prerequisite graph. Each node exposes its concept, evidence count, confidence, state, and next action.

Files added: `js/baa-learning-paths.js`, `test/run-m29-tests.js`, `SECTION-M29-STATUS.md`.
Files updated: `student-os.html`, `README.md`.

## Module 30 — Achievement & Rewards Center
M30 adds evidence-backed gamified XP, milestones, badges, and positive reinforcement. Rewards are motivational and separate from academic marks. XP and badge rules are explicit product rules because the roadmap does not specify a canonical economy.

Files added: `js/baa-rewards.js`, `test/run-m30-tests.js`, `SECTION-M30-STATUS.md`.
Files updated: `student-os.html`, `README.md`.

## Module 31 — Multilingual Learning Ecosystem
M31 adds student-controlled multilingual Tutor responses with English plus seven Indian regional languages. The backend re-validates the selection and preserves mathematics, code, proper nouns, and technical terminology. This is not a claim of professional translation certification or dialect-level localization.

Files added: `js/baa-language.js`, `test/run-m31-tests.js`, `SECTION-M31-STATUS.md`.
Files updated: `student-os.html`, `api/chat.js`, `README.md`.


## M32–M62 Continuous Build
All remaining roadmap module IDs M32–M62 now have implemented capabilities in the continuous baseline. Module-specific status files, focused batch tests, and a project-wide LIMITATIONS.md are included. See `CONTINUOUS-M32-M62-STATUS.md` and `DEFINITION-OF-DONE.md`.

Important: 100% module completion means implemented and tested software capabilities. It does not mean external production dependencies are magically connected; those boundaries are explicitly documented.


## 👤 For Users

If you downloaded BAA and want to know how to operate it, start with **`USER-GUIDE.md`**.

The quickest route is:

1. Extract the ZIP.
2. Open `index.html`.
3. Choose Student OS, Parent OS or Teacher OS.
4. Follow the on-screen controls.
5. Use `USER-GUIDE.md` whenever you need an explanation of a feature.

`USER-GUIDE.md` is written for normal users. `README.md` remains the project/developer overview.

## Production graduation — G4/G5/G6

The project now includes a real production backend boundary rather than only a browser-local design:

- `api/auth/*` — server signup/login/logout/session
- `api/_lib/auth.js` — server-enforced role/learner authorization
- `api/_lib/security.js` — password/session/security helpers
- `api/v1/learner.js` — protected durable learner endpoint
- `api/v1/consent.js` — consent controls
- `api/v1/audit.js` — admin-only audit inspection
- `api/health.js` — database health check
- `db/migrations/001_initial.sql` — production hardening migration
- `scripts/apply-migrations.mjs` — database deployment script
- `scripts/migrate-localstorage.mjs` — migration foundation
- `scripts/export-backup.mjs` — logical backup export
- `account.html` — account UI
- `service-worker.js` + `js/baa-offline-sync.js` — M41 offline-first cache/queue foundation

### Production environment gate

The code is deployment-ready but cannot honestly claim a live production database until `POSTGRES_URL` is configured and `GET /api/health` returns `database: connected`. Likewise, provider-native backups, monitoring, legal compliance certification and external service credentials must be configured in the real deployment.

## Mastery Gate, Parent Bypass & Exam Forecast

BAA now includes a cross-cutting progression control: assessment findings are shown as red until corrective evidence clears them green; the next configured chapter/subject is blocked while the prior chapter has unresolved findings. A linked parent can authorize a specific chapter bypass by re-authenticating with the parent password and recording a reason. Upcoming assessments linked to the BAA catalog can also receive bounded evidence-based percentage forecasts and warnings for Student and Parent OS.

## 2026-08-11 Completion Pass — Scope Protection

The BAA completion program preserves the complete Master Blueprint, Master Development Roadmap, all M1–M62 modules, all A–T sections, and all permanent scope-protection rules. New implementation work is additive only. A feature is promoted toward Blueprint completion only after code, UI, data, security, tests, and applicable external dependencies are verified. Sandbox/provider-neutral billing is explicitly not represented as live payment processing.
