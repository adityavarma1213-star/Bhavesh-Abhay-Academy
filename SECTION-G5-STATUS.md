# Section G5 — Production Database & Migration

## Status
**Implemented as a PostgreSQL-backed application boundary and migration toolchain.**

## Implemented
- PostgreSQL schema remains the canonical data model.
- Production DB adapter via `provider-neutral `postgres` PostgreSQL driver`.
- Initial hardening migration in `db/migrations/001_initial.sql`.
- Schema/migration application script.
- LocalStorage export migration utility.
- Protected learner/profile API using durable database records.

## Gate
A live migration is only complete after a real PostgreSQL instance is provisioned, migrations execute successfully, a representative local export is migrated, and row-level verification passes.
