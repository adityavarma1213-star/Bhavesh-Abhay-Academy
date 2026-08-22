# Checkpoint M21–M23 + M33 — Student UI Wiring

## Before → After
- M21 Practice Engine: orphaned → **wired**
- M22 Weakness Detection: orphaned → **wired**
- M23 Strength Recognition: orphaned → **wired**
- M33 Virtual Labs: orphaned → **wired**

## Files changed
- `student-os.html`
- `js/baa-student-wiring-m21-23-33.js`
- `test/run-m21-23-33-ui-tests.js`
- `UI-REACHABILITY-MATRIX.json`
- `SECTION-M21-23-STATUS.md`
- `SECTION-M33-STATUS.md`
- `CHECKPOINT-M21-23-33.md`

## Scope discipline
No existing M21/M22/M23/M33 engine logic was rewritten. No other module was re-wired. The change adds only real Student OS controls, input handling, and rendering for these four modules.

## External limitations
M33 remains a deterministic browser simulation, not a live physical laboratory. M21–M23 continue to follow their existing evidence/question-bank behavior.
