# BAA OS — Completion Pass: AI Endpoint Security

## Scope

This pass hardens the five Gemini-facing application endpoints:

- `api/chat.js`
- `api/evaluate.js`
- `api/evaluate-homework.js`
- `api/speak.js`
- `api/ai-mode.js`

## Changes

1. Endpoints run on Node.js because authentication and the production PostgreSQL boundary are Node-based.
2. Each endpoint requires a valid BAA session before spending Gemini quota.
3. Each endpoint uses the durable `api_rate_limits` table rather than a per-instance memory map.
4. Caller identity is represented by a SHA-256 keyed hash; raw IP/session identifiers are not stored in the rate-limit table.
5. The rate-limit operation uses an atomic PostgreSQL upsert to avoid per-instance counter drift.
6. Existing input validation, Gemini key server-side storage, retry and timeout behavior remain in place.

## Verification

- 95/95 `test/run-*.js` suites PASS.
- 203/203 JavaScript files pass `node --check`.
- New `test/run-ai-security-tests.js` passes.
- M4-A remains 9/9 PASS.
- M8-C remains fully passing.

## Deployment dependency

A live PostgreSQL database and valid BAA session environment are required for the authentication/rate-limit path. The production frontend origin must also be configured in `ALLOWED_ORIGIN` for cross-origin deployments.
