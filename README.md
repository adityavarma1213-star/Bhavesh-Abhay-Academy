# BAA OS — Bhavesh Abhay Academy

An AI-powered learning operating system. Pure HTML/CSS/JS, no build step — ready to deploy straight to GitHub Pages.

## Pages

| File | Description | Entry point |
|---|---|---|
| `index.html` | Landing page + login flow | Yes — set as homepage |
| `student-os.html` | Main student dashboard | Linked from `index.html` |
| `knowledge-universe.html` | Knowledge Universe (planet/subject explorer) | Linked from `student-os.html` |
| `mathematics-world.html` | Mathematics World (side-scrolling world) | Linked from `knowledge-universe.html` |

All navigation between pages uses relative links (`window.location.href = 'student-os.html'` etc.), so the four files must stay in the same folder — no subfolders needed.

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
