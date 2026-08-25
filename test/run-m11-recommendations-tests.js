import fs from 'node:fs';
import assert from 'node:assert/strict';

const api = fs.readFileSync(new URL('../api/m11-planner-recommendations.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../js/baa-m11-planner-integration.js', import.meta.url), 'utf8');
const catalogue = fs.readFileSync(new URL('../js/baa-guide-catalogue.js', import.meta.url), 'utf8');

assert.match(api, /requireAuth\(req\)/);
assert.match(api, /requireLearnerAccess\(session, learnerId\)/);
assert.match(api, /learning_evidence/);
assert.match(api, /planner_upcoming_assessments/);
assert.match(api, /planner_goals/);
assert.match(api, /server_learning_evidence/);
assert.match(api, /diagnosis or prediction/);

assert.match(bridge, /\/api\/m11-planner-recommendations/);
assert.match(bridge, /credentials:\s*['"]include['"]/);
assert.match(bridge, /m11ServerRecommendations/);
assert.match(bridge, /source: authenticated server learning evidence|Source: authenticated server learning evidence/);
assert.match(catalogue, /baa-m11-planner-integration\.js/);

console.log('M11 planner recommendations contract: 12/12 checks passed');
