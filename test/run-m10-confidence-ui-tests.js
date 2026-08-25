import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync(new URL('../js/baa-m10-confidence-ui.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../js/baa-guide-catalogue.js',import.meta.url),'utf8');

assert.match(ui,/BAAM10Confidence/);
assert.match(ui,/m10ConfidenceOutput/);
assert.match(ui,/BAA_LEARNER_ID/);
assert.match(ui,/BAAM10Confidence\.load/);
assert.match(ui,/credentials/); // authenticated transport remains in the server bridge
assert.match(ui,/insufficient_evidence/);
assert.match(ui,/confidence-meter-track/);
assert.match(ui,/Refresh confidence/);
assert.match(bootstrap,/baa-m10-confidence-ui\.js/);
assert.match(bootstrap,/data-baa-m10-ui/);

console.log('M10 confidence UI contract: 10/10 checks passed');
