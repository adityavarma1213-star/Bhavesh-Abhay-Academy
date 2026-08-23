# BAA Module 63 — Guide Robot

## Implementation status
M63 implementation has been added in code. The Guide Robot uses a verified static feature catalogue, role-aware filtering, accessible keyboard controls, responsive styling, and direct links to documented BAA feature pages. It does not claim an LLM backend or persistence.

## Code
- `js/baa-guide-catalogue.js`
- `js/baa-guide-robot.js`
- `css/baa-guide-robot.css`
- `test/run-m63-tests.js`

## Integration
The one-time integration workflow adds the three M63 assets to the BAA pages defined by the engineering handoff, then removes itself.

## Acceptance boundary
Source-level tests prove the catalogue/robot structure and accessibility hooks. Deployed-browser visibility and click-through remain a separate live acceptance gate until verified on the deployed site.
