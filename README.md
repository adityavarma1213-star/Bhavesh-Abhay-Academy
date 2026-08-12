# BAA OS — G1 Data Access Layer

Status: **schema/foundation only**. Nothing in `js/data-access/` is
wired into `index.html`, `student-os.html`, `assessment.html`,
`teacher-os.html`, `teacher-review.html`, or `parent-os.html` yet.
Sections A–D keep using `js/baa-assessment.js` / `js/baa-planner.js`
/ the Section D inline notes store exactly as before — this folder
does not touch them.

## Why this exists

G1's job is to give BAA a *data-access abstraction* that today's
pages could eventually be switched onto, so that when G4/G5 do the
real backend + migration work, the application code changes once
(behind these repository functions) instead of every page rewriting
its own `localStorage.getItem(...)` calls.

```
BAA application (pages)
        |
repositories/*.js         <- stable functions the app calls
        |
adapters/*Adapter.js       <- LocalStorageAdapter (today) | DatabaseAdapter (future)
        |
localStorage   /   real database (not connected yet)
```

## Adapters

- **`adapters/localStorageAdapter.js`** — reads the *exact same*
  localStorage keys and shapes that `js/baa-assessment.js`,
  `js/baa-planner.js`, and the Section D notes store already use
  (`baa_section_b_data_v1`, `baa_section_c_planner_v1`,
  `baa_section_d_teacher_notes_v1`, `baa_student_name`). It is a
  read/write-compatible view over the same data — it does not
  create a second copy or a new key.
- **`adapters/databaseAdapter.js`** — a stub. Every method throws a
  clear `DATABASE_NOT_CONNECTED` error. This project has **no live
  database connection or credentials**, so this adapter must never
  silently pretend to succeed. It exists purely so the repository
  functions and tests below have a second, schema-shaped
  implementation to compare against, and so G4 has a concrete place
  to plug in a real client later.

`js/data-access/index.js` exposes `getActiveAdapter()`, which
defaults to the `LocalStorageAdapter` (matching current production
behavior) and can be swapped by a future G4/G5 change.

## Repositories

Each repository is a thin, documented function set named after the
concept it owns (`learnerRepository`, `assessmentRepository`,
`evidenceRepository`, `plannerRepository`, `teacherReviewRepository`,
`teacherNotesRepository`). They call into the active adapter and
return data shaped to match `SCHEMA.md` / `db/schema.sql` field names,
so the same repository call works whether the adapter underneath is
localStorage today or a real database after G4/G5.

Single-learner scoping: because Sections A–D have no login system yet
(one browser = one student), every repository call is implicitly
scoped to the one learner in the current browser's localStorage,
matching current app behavior. **This is still true after G2.**
`accountRepository.js` (below) adds real accounts, login, and
sessions, but deliberately does not rewire the repositories above to
take an explicit `learnerId` from an authenticated session — doing
that is real behavior change to A–D's data path and is left for a
later G section, so G2 doesn't risk breaking frozen Sections A–D.

## Accounts (Section G2)

`repositories/accountRepository.js` is new in G2 and is intentionally
separate from the repositories above — it is not learner-scoped, it
manages `users` / `credentials` / `auth_sessions` (the tables G1 and
G2.1 defined but never wired to any code). See that file's header for
the full honesty notes: this is a client-side, local-testing account
system (no live database — same posture as everything else here), not
production-secure authentication. It's wired into `index.html`'s
signup/login modal only; it does not yet gate access to any page
or change how the repositories above resolve a learner.

## Authorization (Section G3)

`repositories/authorizationRepository.js` is new in G3: roles
(`user_roles`), parent/teacher relationships (`parent_learner`,
`teacher_learner`), and classes (`classes`, `class_members`) — the
identity/relationship tables G1 defined but never wired to any code.
It answers "can this user access this learner's data / this class's
roster?" from real relationship rows only, never a fabricated allow.
Like `accountRepository.js`, it is client-side/local-testing only and
is not yet wired into any page's navigation — see its file header and
`README.md`'s "Section G3" for the full scope and honesty notes.
