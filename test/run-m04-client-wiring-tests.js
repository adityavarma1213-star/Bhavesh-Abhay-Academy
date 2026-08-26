// M04 AI Tutor — client transport contract checks.
// These checks verify that the Student OS tutor transport reaches the
// authoritative evidence adapter; deployed/provider acceptance is separate.
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../js/baa-m04-ai-tutor-server.js', import.meta.url), 'utf8');
const catalogue = fs.readFileSync(new URL('../js/baa-guide-catalogue.js', import.meta.url), 'utf8');

const checks = [
  ['M04 client bridge exists', bridge.includes('__BAA_M04_TUTOR_BRIDGE__'), 'bridge is idempotent'],
  ['Tutor endpoint is authoritative', bridge.includes("'/api/m04-ai-tutor'"), 'Tutor requests are routed to the M04 adapter'],
  ['Legacy chat is intercepted', bridge.includes("url.pathname.endsWith('/api/chat')"), 'existing Tutor UI transport is preserved while redirected'],
  ['POST-only interception', bridge.includes("method === 'POST'"), 'non-Tutor GET/static requests are untouched'],
  ['Authenticated credentials', bridge.includes("credentials = options.credentials || 'include'"), 'session cookies are included'],
  ['Learner identity forwarded when available', bridge.includes('BAA_LEARNER_ID') && bridge.includes('learnerId'), 'server can bind evidence to the authenticated learner'],
  ['JSON body preserved', bridge.includes('JSON.parse(options.body)') && bridge.includes('JSON.stringify'), 'existing Tutor request payload remains intact'],
  ['Original fetch preserved', bridge.includes('const originalFetch = global.fetch.bind(global)'), 'bridge avoids recursive fetch interception'],
  ['Shared bootstrap loads bridge', catalogue.includes("js/baa-m04-ai-tutor-server.js"), 'Student OS receives the bridge through centralized wiring'],
  ['M04 adapter remains separate', catalogue.includes("data-baa-m04-tutor-server"), 'bridge has an idempotent bootstrap marker'],
];

let failed = 0;
for (const [name, ok, why] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name} — ${why}`);
  if (!ok) failed++;
}
console.log(`M04 client wiring contract: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
