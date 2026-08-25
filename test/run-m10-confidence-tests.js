import fs from 'node:fs';
import assert from 'node:assert/strict';

const api=fs.readFileSync(new URL('../api/m10-confidence.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../js/baa-m10-confidence-integration.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../js/baa-guide-catalogue.js',import.meta.url),'utf8');

assert.match(api,/requireAuth/);
assert.match(api,/requireLearnerAccess/);
assert.match(api,/learning_evidence/);
assert.match(api,/confidence/);
assert.match(api,/insufficient_evidence/);
assert.match(api,/low_confidence_count/);
assert.match(client,/api\/m10-confidence/);
assert.match(client,/credentials:'include'/);
assert.match(bootstrap,/baa-m10-confidence-integration\.js/);
assert.match(bootstrap,/data-baa-m10-integration/);

console.log('M10 confidence server/client contract: 10/10 checks passed');
