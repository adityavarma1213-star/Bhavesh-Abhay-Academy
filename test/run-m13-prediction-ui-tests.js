import fs from 'node:fs';
import assert from 'node:assert/strict';

const integration = fs.readFileSync(new URL('../js/baa-m13-prediction-integration.js', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../js/baa-guide-catalogue.js', import.meta.url), 'utf8');

assert.match(integration, /BAAPrediction/);
assert.match(integration, /getServerPredictionSummary/);
assert.match(integration, /credentials:'include'/);
assert.match(integration, /m13PredictionOutput/);
assert.match(integration, /insufficient_evidence/);
assert.match(integration, /academic signal/);
assert.match(integration, /BAA_LEARNER_ID/);
assert.match(bootstrap, /baa-m13-prediction-integration\.js/);
assert.match(bootstrap, /data-baa-m13-integration/);

console.log('M13 prediction UI bridge contract: 10/10 checks passed');
