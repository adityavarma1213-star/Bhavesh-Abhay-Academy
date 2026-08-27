import fs from 'node:fs';
import assert from 'node:assert/strict';

const client = fs.readFileSync('js/baa-m02-custom-mode-server-sync.js', 'utf8');
const catalogue = fs.readFileSync('js/baa-guide-catalogue.js', 'utf8');
const customMode = fs.readFileSync('js/baa-custom-mode.js', 'utf8');
const api = fs.readFileSync('api/m02-custom-mode.js', 'utf8');

const checks = [
  ['M02 bridge exists', client.includes('BAAM02ServerSync')],
  ['M02 bridge calls existing server loader', client.includes('BAACustomMode.loadServer')],
  ['M02 bridge dispatches sync event', client.includes("baa:m02-server-sync")],
  ['M02 bridge uses authenticated learner context', client.includes('BAALearnerContext')],
  ['M02 bridge has no local learner-id storage lookup', !client.includes('localStorage')],
  ['M02 bridge is bootstrapped centrally', catalogue.includes("baa-m02-custom-mode-server-sync.js")],
  ['Custom Mode loader sends credentials', customMode.includes("credentials: 'include'" )],
  ['Custom Mode saver sends credentials', customMode.includes("method: 'PUT', credentials: 'include'")],
  ['Custom Mode server enforces authentication', api.includes('requireAuth(req)')],
  ['Custom Mode server enforces learner access', api.includes('requireLearnerAccess(session, learnerId)')],
];
for (const [name, ok] of checks) assert.ok(ok, name);
console.log(`M02 server sync contract: ${checks.length}/${checks.length} checks passed`);
