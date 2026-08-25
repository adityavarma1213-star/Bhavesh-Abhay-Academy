import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../api/m11-planner-recommendations.js', import.meta.url), 'utf8');

assert.match(source, /requireAuth\(req\)/);
assert.match(source, /requireLearnerAccess\(session, learnerId\)/);
assert.match(source, /learning_evidence/);
assert.match(source, /planner_upcoming_assessments/);
assert.match(source, /planner_goals/);
assert.match(source, /server_learning_evidence/);
assert.match(source, /diagnosis or prediction/);

console.log('M11 planner recommendations contract: 7/7 checks passed');
