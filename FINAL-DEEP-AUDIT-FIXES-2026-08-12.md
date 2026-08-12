# BAA OS — Deep Audit Fix Record — 2026-08-12

## Fixed in this build

1. **M17 Teacher Analytics** — browser-local single-student analytics is no longer presented as class analytics. The authenticated `/api/v1/class-analytics` endpoint is the authoritative class-wide path, with teacher ownership checks, active class membership, distinct learner aggregation, and evidence-derived accuracy.
2. **M17 test quality** — the old test that merely asserted the presence of `single_student_private_testing` was replaced with a real two-student aggregation check plus endpoint behavior-contract checks.
3. **Schema status contradiction** — the canonical schema header now matches the current migration/runtime model; historical G1 notes remain for audit history.
4. **Migration numbering** — explicit 002 and 003 history markers close the 001→004 gap without duplicating or deleting schema scope.
5. **Offline M41** — restored `011_offline_sync_inbox.sql`; queued operations now carry unique IDs and creation timestamps, and the server has an idempotency/stale-conflict ledger helper.
6. **Database provider lock-in** — replaced the deprecated Vercel-specific database SDK dependency with the provider-neutral `postgres` driver while preserving the existing tagged-template call sites.

## Scope protection

No Blueprint module is intentionally deleted by this audit fix. The old Galaxy starter remains separate from the selectable Theme Engine Galaxy theme. External deployment requirements (live credentials, payment gateway, ERP, production database provisioning, real two-device tests, compliance certification, human accessibility testing) remain deployment gates rather than being falsely marked as completed in source code.
