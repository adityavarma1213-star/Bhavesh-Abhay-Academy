# Section G6 — Security, Compliance, Audit & Backup

## Status
**Implemented as the production security/compliance foundation.**

## Implemented
- Security response headers.
- Audit-log write path.
- Admin-only audit inspection endpoint.
- Consent preference API.
- Secure password/session handling.
- Logical backup export script.
- Database indexes for session/audit/evidence operations.
- Explicit production environment contract.

## Gate
Legal certification, provider-native encrypted snapshots, retention policies, incident-response exercises and production monitoring still require deployment/organizational configuration; the code does not falsely claim those external controls have already occurred.
