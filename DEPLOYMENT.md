# AI Tutor — Deployment Guide

Architecture: **frontend on GitHub Pages, backend on Vercel.** The frontend never
sees your Gemini API key — it only talks to your Vercel function, which
holds the key as a server-side environment variable and streams the model's
reply back down.

```
Browser (student-os.html on GitHub Pages)
        |  fetch POST /api/chat  (conversation history, no key)
        v
Vercel Edge Function (api/chat.js)
        |  GEMINI_API_KEY from env, added server-side
        v
Gemini API (streamGenerateContent, alt=sse)
```

## 1. Deploy the backend to Vercel

1. Push this whole repo to GitHub (see step 3 — you'll do this once, both
   Vercel and GitHub Pages can build from the same repo).
2. Go to [vercel.com](https://vercel.com), **Add New → Project**, and import
   the repo. Vercel auto-detects the `api/chat.js` Edge Function — no build
   settings needed.
3. Before the first deploy (or right after, then redeploy), go to
   **Project → Settings → Environment Variables** and add:
   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | your free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
   | `ALLOWED_ORIGIN` | `https://yourusername.github.io` (tighten CORS once you know your Pages URL; `*` works while testing) |
4. Deploy. Vercel gives you a URL like `https://baa-os-tutor.vercel.app`.
5. Test the function directly (see **Testing** below) before wiring up the
   frontend.

## 2. Point the frontend at your backend

In `student-os.html`, find this line near the top of the AI Tutor chat script:

```js
const CHAT_API_URL = 'https://YOUR-VERCEL-PROJECT.vercel.app/api/chat';
```

Replace it with your real Vercel URL + `/api/chat`, e.g.:

```js
const CHAT_API_URL = 'https://baa-os-tutor.vercel.app/api/chat';
```

Commit that change.

## 3. Deploy the frontend to GitHub Pages

```bash
git add -A
git commit -m "Wire AI Tutor to production backend"
git push
```

In the repo: **Settings → Pages → Source → Deploy from a branch → main → / (root)**.
GitHub publishes at `https://<username>.github.io/<repo>/`.

## 4. Testing

**Direct backend test (before touching the frontend):**

```bash
curl -N -X POST https://baa-os-tutor.vercel.app/api/chat \
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
curl -i -X POST https://baa-os-tutor.vercel.app/api/chat -H "Content-Type: application/json" -d '{}'

# Wrong method -> 405
curl -i https://baa-os-tutor.vercel.app/api/chat

# Hammer it 25x quickly -> the 21st+ request should 429
for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://baa-os-tutor.vercel.app/api/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"hi"}]}'; done
```

**End-to-end test:** open your GitHub Pages URL, go to AI Tutor, and:
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

**Gemini free tier quota.** As of mid-2026, `gemini-3.6-flash` is Google's
current GA, production-ready Flash model and stays on the free tier
(only Pro-class models require billing). `gemini-2.5-flash` — what this
backend used to run — has begun returning `404` errors ahead of its official
Oct 16, 2026 shutdown, which is why this project no longer uses it.
Free-tier limits change fairly often — check your live numbers in
[Google AI Studio](https://aistudio.google.com) under your project's rate
limits before assuming a fixed number. If students start hitting `429`
errors from Gemini itself (not your own rate limiter), that's the free
quota, and the fix is either waiting for the daily reset or upgrading to a
paid Gemini tier.

For guaranteed limits under real traffic regardless of Google's quota, add
[Upstash Redis](https://vercel.com/marketplace/upstash) and swap the
`rateLimitBuckets` Map in `api/chat.js` for a Redis-backed counter.

## 7. Cost / quota control

- `MAX_OUTPUT_TOKENS` (700) and `MAX_HISTORY_MESSAGES` (20) in `api/chat.js`
  cap usage per request. Lower them if you're close to the daily free cap.
- `MODEL` is set to `gemini-3.6-flash` — the current GA default for a
  free-tier tutor. `gemini-3.5-flash-lite` is an even cheaper/faster free-tier
  option if you need higher throughput; avoid Pro-class models unless you're
  on a paid plan (they're billing-only as of April 2026).
