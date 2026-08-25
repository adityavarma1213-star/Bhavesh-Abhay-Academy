import fs from 'node:fs';
import assert from 'node:assert/strict';

const api = fs.readFileSync(new URL('../api/m13-prediction.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/baa-prediction.js', import.meta.url), 'utf8');

assert.match(api, /requireAuth\(req\)/);
assert.match(api, /requireLearnerAccess\(session, learnerId\)/);
assert.match(api, /FROM assessment_attempts/);
assert.match(api, /FROM learning_memory/);
assert.match(api, /FROM learning_evidence/);
assert.match(api, /insufficient_evidence/);
assert.match(api, /academic_forecast_only/);
assert.match(client, /getServerPredictionSummary/);
assert.match(client, /credentials:'include'/);
assert.match(client, /api\/m13-prediction/);

console.log('M13 server prediction contract: 10/10 checks passed');
