# Section G4 — Production Authentication & Server Authorization

## Status
**Implemented in the codebase; deployment requires a configured PostgreSQL provider and HTTPS environment.**

## Implemented
- Server-side signup/login/logout/session resolution.
- PBKDF2-SHA256 password hashing with per-password random salt.
- HttpOnly, Secure, SameSite session cookie.
- Server-side session token hashing and revocation.
- Server-side role resolution.
- Server-side learner access checks for student/parent/teacher/admin.
- Protected learner endpoint.
- Account UI (`account.html`).

## Gate
A live production deployment is only considered connected after `POSTGRES_URL` is configured and `GET /api/health` reports `database: connected`.
