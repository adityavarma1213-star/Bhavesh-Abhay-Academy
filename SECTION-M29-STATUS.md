# BAA Module 29 — AI Learning Paths

## Blueprint mapping
M29 — sequential, node-based syllabus mastery journeys.

## Implemented
- Generates a sequential node-based learning queue from existing BAA concept-state evidence.
- Prioritizes concepts needing revision, then learning concepts, then concepts with insufficient evidence, while preserving transparent state/evidence fields.
- Identifies a current node.
- Shows an explicit action for each node.
- Handles no-evidence state honestly.
- Exposes a limitation explaining that BAA has not inferred a canonical prerequisite graph.

## Honest limitation
The supplied Blueprint states the M29 purpose but does not provide a canonical syllabus graph, prerequisite dataset, or detailed path-generation acceptance criteria. Therefore this implementation is an evidence-priority journey, not a fabricated curriculum or claim of hidden prerequisite knowledge.

Files added: `js/baa-learning-paths.js`, `test/run-m29-tests.js`, `SECTION-M29-STATUS.md`.
Files updated: `student-os.html`, `README.md`.
