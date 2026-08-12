# AI Tutor — Deployment Guide

**Architecture (updated): single Vercel deployment.** The HTML pages
(`index.html`, `student-os.html`, `teacher-os.html`, `parent-os.html`,
`assessment.html`, `homework-scanner.html`, etc.) and every function under
`/api` deploy together from **one Vercel project**. There is no separate
GitHub Pages step and no second domain to keep in sync — every `fetch()`
call in the codebase, including the AI Tutor chat, uses a relative path
like `/api/chat`, which only resolves correctly when the HTML and the API
share an origin. That's why this changed from the earlier split
GitHub-Pages-frontend / Vercel-backend design: the split left 29 of the
30 `/api/*` calls in the codebase pointed at a path that didn't exist on
GitHub Pages, so most server-backed features (auth, learner data, Mastery
Gate, homework sync, billing, etc.) silently 404'd. A single deployment
makes every one of those calls correct with no per-file URL to remember.

The browser still never sees your Gemini API key — it only talks to the
Vercel functions, which hold the key as a server-side environment variable.

```
Browser (any page, e.g. student-os.html, served from your Vercel domain)
        |  fetch POST /api/chat  (conversation history, no key)
        v
Vercel Function (api/chat.js) — same domain as the page that called it
        |  GEMINI_API_KEY from env, added server-side
        v
Gemini API (streamGenerateContent, alt=sse)
```

## 1. Push the whole repo to GitHub

```bash
git add -A
git commit -m "Deploy BAA OS"
git push
```

## 2. Deploy the repo to Vercel

1. Go to [vercel.com](https://vercel.com), **Add New → Project**, and import
   the repo. Vercel auto-detects the static HTML pages *and* the `/api`
   folder's serverless functions in one project — no build settings needed.
2. Before the first deploy (or right after, then redeploy), go to
   **Project → Settings → Environment Variables** and add:
   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | your free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
   | `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` | your Postgres connection strings (see `db/schema.sql`) |
   | `ALLOWED_ORIGIN` | your Vercel project's own domain, e.g. `https://baa-os.vercel.app` — since the frontend and API now share an origin, this mainly matters if you also embed pages elsewhere |
3. Deploy. Vercel gives you one URL, e.g. `https://baa-os.vercel.app` — that
   single URL serves both the pages and the `/api/*` functions.
4. Open that URL directly (not a GitHub Pages URL) to use the site. No
   `CHAT_API_URL`/`EVAL_API_URL`/etc. constants need editing per environment
   — they're relative paths already.

## 3. Testing

**Direct backend test (before touching the frontend):**

```bash
curl -N -X POST https://baa-os.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "studentName": "Test Student",
    "messages": [{"role":"user","content":"Explain photosynthesis in one sentence."}]
  }'
```

You should see a stream of `data: {...}` lines (Server-Sent Events), each a
JSON chunk with `candidates[0].content.parts[0].text` holding a piece of the
reply.

**Error-path checks:**

```bash
# Missing messages -> 400
curl -i -X POST https://baa-os.vercel.app/api/chat -H "Content-Type: application/json" -d '{}'

# Wrong method -> 405
curl -i https://baa-os.vercel.app/api/chat

# Hammer it 25x quickly -> the 21st+ request should 429
for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://baa-os.vercel.app/api/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"hi"}]}'; done
```

**End-to-end test:** open your deployed Vercel URL, go to AI Tutor, and:
- Send a normal question — reply should stream in word by word.
- Ask for something with a numbered list or a code snippet — check it renders
  as real markdown, not literal `**`/`` ``` ``.
- Ask "what's 2 + 2" then a follow-up like "and if I double that?" — the
  second answer should show the model remembers the first (conversation
  memory, sent from `chatHistory`).
- Turn off wifi and send a message — you should get the friendly error bubble
  with a **Retry** button, and Retry should resend the same message.
- Reload the page — chat history should still be there (localStorage).
- Click "🔄 New conversation" — history should clear.

## 5. Local development (optional)

```bash
npm i -g vercel
cp .env.example .env.local   # fill in your real GEMINI_API_KEY
vercel dev
```

This serves `api/chat.js` at `http://localhost:3000/api/chat`. Point
`CHAT_API_URL` at that while developing, and switch it back to your
production Vercel URL before deploying the frontend.

## 6. Known limitations

**Rate limiting.** `api/chat.js` includes a best-effort in-memory rate
limiter (20 requests / 5 minutes per IP). Because Vercel Edge Functions can
run across multiple isolated instances, this only throttles within a single
instance's lifetime — it's a safety net against runaway loops, not a hard
distributed limit. Google's own free-tier quota is enforced on top of this
regardless (see below).

**Gemini free tier quota.** `api/chat.js` is currently configured to use
`gemini-3.5-flash-lite` (see the `MODEL` constant near the top of the file).
Free-tier limits change fairly often — check your live numbers in
[Google AI Studio](https://aistudio.google.com) under your project's rate
limits before assuming a fixed number. If students start hitting `429`
errors from Gemini itself (not your own rate limiter), that's the free
quota, and the fix is either waiting for the daily reset, switching the
`MODEL` constant to a model with more free headroom, or upgrading to a paid
Gemini tier.

For guaranteed limits under real traffic regardless of Google's quota, add
[Upstash Redis](https://vercel.com/marketplace/upstash) and swap the
`rateLimitBuckets` Map in `api/chat.js` for a Redis-backed counter.

## 7. Cost / quota control

- `MAX_OUTPUT_TOKENS` (2048) and `MAX_HISTORY_MESSAGES` (20) in `api/chat.js`
  cap usage per request. Lower them if you're close to the daily free cap.
- `MODEL` is set to `gemini-3.5-flash-lite`. If you change it, check the
  model's current free-tier limits in Google AI Studio first — smaller/lite
  models generally have more generous free quotas than their full-size or
  `-pro` counterparts, but exact numbers shift over time.

## 8. Section B — AI Evaluation backend (`api/evaluate.js`)

Same deploy step as `api/chat.js` — it lives under `api/`, so deploying to
Vercel (step 1) publishes it automatically. It reuses `GEMINI_API_KEY` and
`ALLOWED_ORIGIN` — no new secret to add. Unlike `api/chat.js`, it is
**not** a streaming endpoint: the assessment player needs one complete
JSON evaluation object per question before it can show a score, so it
calls Gemini's non-streaming `generateContent` and returns
`application/json`, using `gemini-3.5-flash-lite` — same model as the
tutor, per Section B's instruction not to change models without
justification.

**Point the frontend at it:** in `assessment.html`, find:
```js
const EVAL_API_URL = 'https://YOUR-VERCEL-PROJECT.vercel.app/api/evaluate';
```
and replace with your real Vercel URL, same pattern as `CHAT_API_URL`.

**Direct backend test:**
```bash
curl -i -X POST https://baa-os.vercel.app/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "question": {
      "text": "Calculate 1/3 + 1/4. Show your working.",
      "type": "math",
      "marks": 3,
      "modelAnswer": "Common denominator 12: 4/12 + 3/12 = 7/12."
    },
    "studentAnswer": "1/3 = 4/12 and 1/4 = 3/12, so 4/12+3/12 = 7/12"
  }'
```
You should get back a JSON object with `score`, `correctness`, `explanation`,
`confidence`, and `humanReviewRequired`.

**Error-path checks:** same pattern as `api/chat.js` — missing `question`
or `studentAnswer` → 400; wrong method → 405; hammering it 35x quickly →
some 429s (30 requests / 5 minutes per IP, same best-effort in-memory
limiter caveat as `api/chat.js`).

## 8b. Section B — Human Review (`teacher-review.html`)

No separate deploy step: it's a static page that reads/writes the same
`localStorage` key as `assessment.html` (`baa_section_b_data_v1`), so it
just needs to sit in the same repo and deploy together with
everything else. It does **not** call `api/evaluate.js` or any backend —
review decisions are pure client-side data operations in
`js/baa-assessment.js` (`getTeacherReviewQueue`, `submitTeacherReview`).

**What has and hasn't been tested:** the review data-layer functions
(`getTeacherReviewQueue`, `submitTeacherReview` — accept/edit/reject,
score recomputation, audit-trail preservation, Learning Evidence
correction) were run end-to-end in a Node harness against
`js/baa-assessment.js` and `js/question-bank.js` directly (localStorage
shimmed, `fetch` mocked to return a low-confidence AI evaluation) and
behaved correctly. The `teacher-review.html` page itself was reviewed and
syntax-checked but **not exercised in a real browser** — this environment
has no browser automation available. Before relying on it, open it once
after a real assessment submission and confirm the queue renders and the
three actions work as expected.

**What it does not yet have (by design — out of scope for Section B):**
teacher accounts/login, a way to filter by student or class, and any
server-side record of who reviewed what (the `reviewer` name is just a
free-text field, not an authenticated identity). That's Section D
territory.

## 8c. AI evaluation — what was and wasn't actually live-tested

`api/evaluate.js` (request validation, prompt construction, retry logic,
JSON extraction/clamping, and the fallback "unreadable result" response)
was read in full and is structurally sound, but **this build environment
has no network access**, so the real Gemini call inside it could not be
exercised end-to-end. What *was* tested: `js/baa-assessment.js`'s
`gradeWithAI()`/`submitAttempt()` flow was run in Node with `fetch` mocked
to return a realistic evaluation payload (`score`, `correctness: 
'partially_correct'`, `confidence: 'low'`, `humanReviewRequired: true`),
confirming the frontend correctly displays score/max/explanation/errors/
missing concepts/suggested improvement/confidence, correctly writes
Learning Evidence, and correctly queues the answer for human review.

**Before calling AI evaluation "live tested," run the `curl` command in
section 8** against your real deployed `api/evaluate.js` with each of:
a correct short answer, an incorrect one, a partially correct one, a
correct-method-arithmetic-slip math answer, a wrong-method math answer,
an empty answer, and a deliberately malformed request (to check the
502/400 paths) — and confirm each produces a sane, non-fabricated result.

## 9. Section B data storage (read this before treating it as production)

Assessment attempts, learning evidence, learning-memory status, and
mistake patterns are stored in the browser's `localStorage` under the key
`baa_section_b_data_v1` (see `js/baa-assessment.js`). This is a
**temporary, single-student-per-browser, private-testing data layer** —
matching how Section A already handles `studentName` (a JS variable /
localStorage, no real login system). It is **not** a production database:

- It never leaves the student's browser — nothing is sent to a server
  except the specific question+answer text sent to `api/evaluate.js` for
  grading (which does not store it either — it's stateless).
- It is per-browser, not per-student-account — a student switching
  devices or clearing browser data starts fresh.
- It has no backup, sync, or teacher-visible copy yet.

**Mapping to a real database later:** every function in
`js/baa-assessment.js` (`startAttempt`, `saveAnswer`, `submitAttempt`,
`getLearningMemory`, `getMistakePatterns`, etc.) already reads and writes
through a single `load()`/`save()` pair. Swapping `localStorage` for real
API calls to a production database means changing those two functions
(and making the public functions `async`) — the rest of the app,
including `assessment.html` and the Section A Learning Profile panels in
`student-os.html`, would not need to change, since they only ever call
the public `BAAAssessment.*` functions.

## 9b. Section C — Learning Intelligence + AI Planner (no new deployment step)

Section C (`js/baa-intelligence.js`, `js/baa-planner.js`, and the AI
Planner world in `student-os.html`) is pure client-side logic that reads
Section B's existing `localStorage` evidence — it introduces no new API
endpoint and requires no deployment change beyond what Section B already
needs. Its own planner state (goals, time preference, upcoming
assessments, task history) lives in a second, equally clearly-labeled
`LOCAL_BROWSER_STORAGE_TESTING_ONLY` key, `baa_section_c_planner_v1`. See
README.md → "Section C — Learning Intelligence + AI Planner" for the full
architecture and exactly which Section B evidence-gating rules it extends
vs. leaves untouched.

## 9c. Section D — Parent OS + Teacher OS (no new deployment step)

`parent-os.html` and `teacher-os.html` are two new static pages — same
deployment as every other `.html` file in this project (step 3, GitHub
Pages, no build step). They introduce **no new API endpoint** and **no new
environment variable** — they call the existing Section B/C client-side
modules only (`js/question-bank.js`, `js/baa-assessment.js`,
`js/baa-intelligence.js`, `js/baa-planner.js`), the same four `<script>`
includes `assessment.html` and `teacher-review.html` already use.

The one new piece of storage, `baa_section_d_teacher_notes_v1` (teacher
notes, free text, single device), is `localStorage`-only, same honesty
labeling as Sections B and C — not synced anywhere, not a real multi-user
notes system yet.

**Testing checklist addition:** after deploying, open `student-os.html`,
scroll to the footer, and confirm the "Parent View" / "Teacher View" links
open `parent-os.html` / `teacher-os.html` correctly. Run
`node test/run-section-d-smoke.js` locally before deploying to catch any
regression in the data calls both pages depend on.

## 9d. Section G2 — accounts/login (no new deployment step, read before treating as production auth)

`index.html`'s signup/login modal now creates real accounts and
sessions, but entirely client-side against a third `localStorage` key,
`baa_section_g2_accounts_v1` — same honesty labeling as Sections B/C/D.
No new API endpoint, no new environment variable, no build-step change.

**This is not production authentication.** Passwords are salted and
hashed (SHA-256) before storage — never plaintext — but the hashing
happens in the browser, with no server to keep the salt, the hash
computation, or anything else secret from that browser. There is also
no rate-limiting, no HTTPS-enforced transport (there's no transport at
all — nothing leaves the browser), and no server-side verification of
any kind. Treat every account created here exactly like Section B's
assessment data: real code, real logic, zero production security
guarantees until a real backend exists (Section G4).

**Testing checklist addition:** run `node test/run-g2-tests.js` locally
before deploying — it covers signup validation, duplicate-email
rejection, login success/failure, session expiry/revocation, and a
check that Sections A–D's own `localStorage` keys are untouched.

## 10. Voice (text-to-speech) backend

`student-os.html`'s "Auto-speak replies" feature calls a second Vercel Edge
Function, `api/speak.js`, using `SPEAK_API_URL` (same pattern as
`CHAT_API_URL` — update it the same way once you have your real Vercel URL).
It reuses the same `GEMINI_API_KEY` env variable as `api/chat.js` — no
separate secret to add. It's currently configured to use
`gemini-3.1-flash-tts-preview`. Because both functions live under `api/`,
deploying to Vercel (step 1) publishes both automatically — there's no
extra deployment step, just the `SPEAK_API_URL` line to update alongside
`CHAT_API_URL`.

**Quick test after deploying:** open the AI Tutor, send a message, and turn
on "Auto-speak replies" — the reply should play back as natural speech once
the text finishes streaming in.

### Module 8 M8-C — PDF support and hardening

`homework-scanner.html` loads PDF.js from the existing CDN URL and uses `js/baa-homework-pdf.js` for browser-side extraction of selectable PDF text. No new environment variable is required. The PDF.js CDN dependency must remain reachable for PDF uploads to work. Scanned/image-only PDFs are intentionally rejected because M8-C does not claim OCR or image-content evaluation.

M8-C hardening adds `js/baa-homework-attachment-base.js` as the shared common attachment contract for image/PDF metadata and adds server-side re-validation of extracted homework text in `api/evaluate-homework.js`. No raw PDF/image bytes are added to the browser-local submission record. No additional deployment secret is required for this hardening pass.

### Module 8 M8-D1 — Teacher Review integration

`teacher-review.html` now reads both the existing Section B assessment review queue and the Module 8 Homework Scanner review queue. Homework evaluations requiring human review are surfaced automatically. Human decisions are stored separately from the original AI evaluation so the original AI output remains auditable. The current implementation continues to use localStorage for private testing; real server-side teacher authorization/database persistence remains part of the later backend production gates.

### Module 8 M8-D2 — Learning Memory / Mistake Archeology integration

`homework-scanner.html` loads the existing `js/baa-assessment.js` engine so an evaluated homework submission can feed explicit `learningSignals` into the same Section B evidence store used by assessments. Only high-confidence, non-uncertain signals are accepted. They are tagged as `homework_evaluation` evidence and passed through the existing Learning Memory and Mistake Archeology thresholds; no new mastery algorithm or parallel memory store is introduced. No new environment variable is required. The current localStorage-backed data layer remains testing-only until the G4/G5 backend and database gates are implemented.

## 10. Production graduation — G4/G5/G6

### G4 — Authentication / authorization
Deploy the Node-runtime auth endpoints under `api/auth/`. Configure `POSTGRES_URL` and HTTPS. The account page is `account.html`. Server authorization is enforced in `api/_lib/auth.js`; never rely on localStorage role checks for production access.

### G5 — Database
1. Provision PostgreSQL.
2. Set `POSTGRES_URL` (and optionally `POSTGRES_URL_NON_POOLING`) to a PostgreSQL connection string from your chosen provider. The code does not require Vercel Postgres.
3. Run `npm install`.
4. Run `npm run db:migrate`.
5. Check `/api/health` until it reports `database: connected`.
6. Export a representative localStorage dataset and run `node scripts/migrate-localstorage.mjs <export.json>` as the migration starting point.
7. Verify learner ownership, assessment/evidence counts and planner records before cutover.

### G6 — Security / audit / backup
- Keep HTTPS enabled.
- Keep the auth cookie HttpOnly/Secure/SameSite.
- Configure a strict `ALLOWED_ORIGIN`.
- Review `api/v1/audit.js` as an admin-only endpoint.
- Run `npm run db:export` for logical exports.
- Also enable the database provider's encrypted snapshots, retention and recovery testing; code alone cannot create those external controls.

### M41 offline-first
`service-worker.js` caches the main BAA shell and `js/baa-offline-sync.js` queues local learning events in IndexedDB. Real server synchronization requires a configured sync endpoint and should only be enabled after authentication is available.

## 8.1 Mastery Gate grading-verdict secret

The authenticated assessment sync path does not trust browser-reported correctness. Deterministic MCQ/True-False answers are re-graded from the server-side `questions.correct_answer`. AI-graded answers receive a short-lived HMAC verdict token from `/api/evaluate` and `/api/v1/assessment` verifies that token before persisting the result.

Set the production environment variable:

`ASSESSMENT_VERDICT_SECRET=<long-random-secret>`

Use a unique high-entropy secret per deployment environment. If this secret is missing, AI assessment results are intentionally left unresolved for human review rather than treated as trusted.
