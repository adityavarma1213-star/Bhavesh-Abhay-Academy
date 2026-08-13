# Fix Log — Theme Engine Rollout + API Hosting Consistency
**Date:** 12 August 2026
**Scope:** Fixes the confirmed findings from the independent deep audit
(`BAA_OS_DEEP_AUDIT_2026-08-12.md`). Every change below is a real file
diff, not a status claim — verify by opening the files.

## What was actually changed

1. **Theme Engine now loads on all 13 pages, not just `student-os.html`.**
   - Extracted the theme CSS (palettes, button, panel, light/dark/system
     rules — 137 lines) out of `student-os.html`'s inline `<style>` into
     a new shared file: `css/baa-themes.css`. This is now the single
     source of truth for theme styling; `student-os.html` no longer
     carries a duplicate copy.
   - Added `<link rel="stylesheet" href="css/baa-themes.css">` and
     `<script src="js/baa-themes.js"></script>` to all 12 pages that were
     missing them: `index.html`, `assessment.html`, `teacher-os.html`,
     `parent-os.html`, `knowledge-universe.html`, `mathematics-world.html`,
     `homework-scanner.html`, `account.html`, `billing.html`,
     `teacher-review.html`, `trust-privacy.html`, `feature-map.html`.
   - Added the stylesheet link to `student-os.html` too, since its CSS
     moved out to the shared file.

2. **`js/baa-themes.js` now activates itself on every page** instead of
   waiting for a manual `activate()` call buried inside `student-os.html`'s
   multi-step onboarding animation. `student-os.html`'s existing explicit
   call is untouched and harmless — `build()`/`apply()` are idempotent.

3. **`js/baa-themes.js` now works on pages with no `.tb-right` topbar
   container.** Previously `build()` returned early (silently, no button)
   if that CSS selector didn't exist. It now falls back to mounting a
   small fixed floating button in the top-right corner of the page —
   used by `index.html`, `account.html`, `billing.html`, and
   `feature-map.html`, which don't have the dashboard topbar structure.

4. **Fixed the API hosting mismatch.** Per your decision, BAA OS is now a
   **single Vercel deployment** — one project serves both the HTML pages
   and every function in `/api`. This makes every existing relative
   `/api/...` call (the ~29 that were already relative) correct as-is.
   The 4 endpoints that were hardcoded to an absolute URL were switched
   to match:
   - `student-os.html`: `CHAT_API_URL` → `/api/chat`
   - `student-os.html`: `SPEAK_API_URL` → `/api/speak`
   - `assessment.html`: `EVAL_API_URL` → `/api/evaluate`
   - `homework-scanner.html`: `EVAL_HOMEWORK_API_URL` → `/api/evaluate-homework`
   - `DEPLOYMENT.md` rewritten to describe this architecture and drop the
     old GitHub-Pages-frontend / separate-Vercel-backend instructions.

5. **Fixed the stray `.js` bug in `js/baa-ai-mode.js`.** It was calling
   `fetch('/api/ai-mode.js')` — with the extension — which would 404 even
   with correct hosting, since the real route is `/api/ai-mode`. Also
   fixed `test/run-m1-a1-tests.js`, which had an assertion that literally
   checked for the buggy `/api/ai-mode.js` string — that test would have
   locked the bug in as "passing" behavior. Both are corrected and the
   suite passes on the fixed code.

## What was verified (and how)

- `node --check` on every `.js` file and every inline `<script>` block in
  every `.html` file: **0 syntax errors**, before and after these changes.
- All 13 pages confirmed (via grep) to include both `css/baa-themes.css`
  and `js/baa-themes.js`.
- HTML structural sanity check: exactly one `<head>`/`</head>` and one
  `<body>`/`</body>` pair per page after the edits (the earlier "2 heads"
  false alarm on `billing.html`/`feature-map.html` was just `<header
  class="head">` matching the grep pattern, not a real duplicate tag).
- Full test suite: **99/99 files pass**, including the 7 mandatory gate
  suites (`run-tests.js`, `run-section-d-smoke.js`, `run-e-tests.js`,
  `run-g1-tests.js`, `run-g2-tests.js`, `run-g2.1-tests.js`,
  `run-g3-tests.js`) and the corrected `run-m1-a1-tests.js`.
- Confirmed zero remaining hardcoded `vercel.app` URLs anywhere in the
  codebase (`grep -rl "vercel\.app"` returns nothing).

## What was NOT verified — needs a real deploy to confirm

I cannot deploy this to Vercel, click through a live browser, or take a
screenshot from here. These items are code-level fixes that pass every
automated check available in this environment, but the only way to fully
confirm them is to actually deploy and click through:

- That the theme button visually renders correctly (positioning, z-index,
  contrast) on all 13 pages in a real browser, especially the 4 pages
  using the new floating-fallback mount point.
- That switching themes/modes actually repaints each page as expected —
  the CSS rules are in place and match the same selectors used in the
  previously-working `student-os.html`, but visual confirmation needs a
  live render.
- That the deployed Vercel project correctly serves both the HTML pages
  and the `/api` functions from one origin (this depends on your Vercel
  project settings when you import the repo, not just the code).
- That `GEMINI_API_KEY` and `POSTGRES_URL`/`POSTGRES_URL_NON_POOLING` are
  set in your Vercel project's environment variables — without them, the
  AI Tutor, evaluation, and database-backed endpoints will still fail,
  independent of everything fixed here.

**To verify yourself:** deploy this repo to one Vercel project (see the
updated `DEPLOYMENT.md`), open the resulting URL, and check that the
theme button appears top-right on the landing page (`index.html`) before
you even log in, and that switching themes changes the page's colors.
