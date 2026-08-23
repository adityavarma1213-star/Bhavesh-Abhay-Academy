# BAA Strict Audit Remediation Pass — 2026-08-23D

## Changes made in this pass

### Teacher Portal discoverability regression protection
- Added `test/run-teacher-static-entry-tests.js`.
- The gate checks that `student-os.html` contains exactly one static Teacher Portal entry.
- It verifies the Academic Management label, authenticated account route, visible CTA, fixed positioning, and high z-index used by the latest visibility repair.
- Added the explicit `test:teacher-static` npm script.
- The repository-wide `npm test` runner already discovers `run-*.js` tests automatically, so the new gate is also included in the full test suite.

## Existing fixes confirmed from the latest repository state

- M20 career explainability has evidence mapping, status distinctions, evidence IDs/counts, methodology, limitations, and a dedicated test gate.
- M62 has a dedicated coverage test and is included in the repository-wide test runner.
- Teacher Portal visibility has been repaired directly in `student-os.html` and is additionally covered by the existing Teacher Portal discoverability test.

## Verification boundary

This pass does **not** claim a successful live-browser or production-database run merely from GitHub source inspection. Those remain separate acceptance gates until execution evidence is available.

## Remaining categories

External-provider, legal/compliance, production infrastructure, credentials, deployed-browser, and production-database requirements remain blocked/pending when the required external evidence is absent. They must not be marked complete merely by changing documentation.
