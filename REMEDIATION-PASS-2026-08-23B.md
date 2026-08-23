# BAA Remediation Pass — 2026-08-23B

## Purpose
Close a concrete Blueprint/UI reachability gap identified by the strict audit and the deployed-UI review: a Teacher Portal existed in the repository, but the authenticated BAA OS did not expose a role-aware Teacher/Academic Management entry point from the OS workspace.

## Implemented

### Teacher/Admin role-aware OS navigation
- Updated `js/baa-themes.js`.
- On authenticated pages that load the theme engine, the client asks `/api/auth/me` for the current server-authoritative role.
- `teacher` and `admin` roles receive a visible `👩‍🏫 Teacher Portal` link to `teacher-portal.html`.
- Student/parent users do not receive the teacher link.
- The link is additive and does not weaken the existing server-side guard on `teacher-portal.html`.

### Regression coverage
- Added `test/run-teacher-portal-discoverability.js`.
- Added the regression to the main `npm test` chain.
- Added `npm run test:teacher-portal` for focused execution.

## Evidence
- Commit `4a1a678291fc715a5b02b8ba9278fdc5b6f99a6f` — role-aware Teacher Portal navigation.
- Commit `d06296bf2006c296e45a20a429623081005cefec` — discoverability regression test.
- Commit `d0f713c18a0888766dbedc86cac3acdb932a367c` — npm test integration.

## Acceptance state
- Source implementation: COMPLETE.
- Regression coverage: COMPLETE.
- Live deployed-browser acceptance: NOT YET VERIFIED.

This pass does **not** claim that BAA is 100% Blueprint/statutory complete. The strict M1–M62 audit remains the governing acceptance matrix.
