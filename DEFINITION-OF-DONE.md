# BAA Definition of Done

## Strict release gate

A Blueprint/Roadmap item is **COMPLETE** only when all applicable gates are satisfied:

- [ ] Scope matches the current roadmap/blueprint.
- [ ] A real visible UI entry/control exists in the intended role workflow.
- [ ] The control invokes the intended module using real page/user input.
- [ ] The result is rendered back into the UI.
- [ ] Authentication and authorization are enforced where required.
- [ ] Intended persistence uses the correct server/database/storage path where the roadmap requires persistence.
- [ ] External inputs are validated.
- [ ] Security-sensitive behavior is explicit and defensive.
- [ ] Honest insufficient-evidence/error/unavailable states exist.
- [ ] Module-specific tests exist and pass.
- [ ] Focused/batch regression tests exist and pass.
- [ ] The deployed browser workflow has been manually accepted.
- [ ] Refresh/re-login/cross-device behavior has been verified where applicable.
- [ ] README/status/audit documentation reflects the current implementation.
- [ ] Changed files and release commits are recorded.

A source file, Feature Explorer card, unit test, or successful build **alone is never proof of completion**.

## Current audit truth

The repository contains 62 M62 feature definitions. The 2026-08-22 strict audit is recorded in `BLUEPRINT-ROADMAP-DEEP-AUDIT-2026-08-22.md`. That audit intentionally does **not** claim 100% completion because reliable deployed-browser acceptance has not been independently completed for every module and several roadmap items require real external providers/infrastructure.

## External dependency rule

Where a feature genuinely requires provider credentials, live external data, legal approval, production storage, payment webhooks, ERP connectivity, or another infrastructure dependency, the item remains pending until that dependency is actually verified. BAA must show an honest unavailable/foundation state rather than fabricate success.

## Status-document accuracy rule

Status and gap-register documents must be regenerated from current source code, UI wiring, database schema/migrations, tests, and deployment configuration. Historical completion claims must never be copied forward without re-verification.
