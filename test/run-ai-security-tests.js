// BAA AI endpoint security contract tests.
// These are source/contract checks; live DB enforcement is verified separately by deployment tests.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let failures = 0;
function assert(cond, msg){ if(cond) console.log('PASS:', msg); else { console.error('FAIL:', msg); failures++; } }
const endpoints=['api/chat.js','api/evaluate.js','api/evaluate-homework.js','api/speak.js','api/ai-mode.js'];
for(const file of endpoints){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  assert(/runtime:\s*['"]nodejs['"]/.test(text), `${file}: uses Node runtime required by server auth`);
  assert(text.includes("requireAuth"), `${file}: requires authenticated session`);
  assert(text.includes("consumeAiRateLimit"), `${file}: uses durable AI rate limiter`);
  assert(!text.includes('rateLimitBuckets'), `${file}: no in-memory-only rate limiter remains`);
}
const limiter=fs.readFileSync(path.join(root,'api/_lib/ai-rate-limit.js'),'utf8');
assert(limiter.includes('INSERT INTO api_rate_limits'), 'AI limiter: atomic database upsert exists');
assert(limiter.includes('key_hash'), 'AI limiter: stores hashed caller identity, not raw IP/session');
const migration=fs.readFileSync(path.join(root,'db/migrations/008_api_rate_limits.sql'),'utf8');
assert(migration.includes('CREATE TABLE IF NOT EXISTS api_rate_limits'), 'Migration: durable rate-limit table exists');
assert(migration.includes('PRIMARY KEY'), 'Migration: rate-limit key is uniquely constrained');
if(failures){ console.error(`${failures} AI security contract test(s) failed.`); process.exit(1); }
console.log('AI endpoint security contract tests: PASS');
