// M03 authenticated Hybrid Mode server-sync contract checks.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const bridge = fs.readFileSync(new URL('../js/baa-m03-hybrid-mode-server-sync.js', import.meta.url), 'utf8');
const module = fs.readFileSync(new URL('../js/baa-hybrid-mode.js', import.meta.url), 'utf8');
const catalogue = fs.readFileSync(new URL('../js/baa-guide-catalogue.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/m03-hybrid-mode.js', import.meta.url), 'utf8');

const checks = [
  ['bridge exports a sync API', /BAAM03ServerSync\s*=\s*\{\s*sync/.test(bridge)],
  ['bridge uses authenticated learner context', /BAA_LEARNER_ID/.test(bridge)],
  ['bridge delegates to existing Hybrid Mode loader', /BAAHybridMode/.test(bridge) && /loadServer/.test(bridge)],
  ['bridge does not read arbitrary learner local storage', !/localStorage/.test(bridge)],
  ['bridge dispatches a sync event after success', /baa:m03-server-sync/.test(bridge) && /CustomEvent/.test(bridge)],
  ['Hybrid Mode client uses session credentials', /credentials:\s*['"]include['"]/.test(module)],
  ['Hybrid Mode server enforces authentication', /requireAuth\(req\)/.test(api)],
  ['Hybrid Mode server enforces learner ownership', /requireLearnerAccess\(session, learnerId\)/.test(api)],
  ['shared bootstrap loads M03 bridge', /baa-m03-hybrid-mode-server-sync\.js/.test(catalogue)],
  ['bootstrap uses a dedicated M03 marker', /data-baa-m03-server-sync/.test(catalogue) && /data-baa-m03-server-sync/.test(bridge)],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
}
console.log(`M03 server-sync contract: ${checks.length}/${checks.length} checks passed`);
