// M04 AI Tutor — source contract checks.
// These checks intentionally inspect source structure; deployed/provider acceptance is separate.
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/m04-ai-tutor.js', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../api/chat.js', import.meta.url), 'utf8');

const checks = [
  ['M04 adapter exists', api.includes("import baseHandler from './chat.js'"), 'chat.js remains the canonical streaming implementation'],
  ['Authentication enforced', api.includes('requireAuth(req)'), 'adapter rejects unauthenticated tutor requests'],
  ['Learner ownership enforced', api.includes('requireLearnerAccess(session, learnerId)'), 'requested learner is authorization-checked'],
  ['Student learner resolution', api.includes('FROM learners') && api.includes('user_id=${session.user_id}'), 'student sessions can resolve their own learner'],
  ['Server learning memory evidence', api.includes('FROM learning_memory'), 'concept states come from PostgreSQL'],
  ['Server raw evidence', api.includes('FROM learning_evidence'), 'mistake/context signals come from PostgreSQL'],
  ['Server assessment evidence', api.includes('FROM assessment_attempts'), 'recent assessment performance is server-derived'],
  ['Client context is replaced', api.includes('learningContext,') && api.includes('req.json = async () => authoritativeBody'), 'untrusted browser learningContext is not forwarded'],
  ['Existing tutor safety path preserved', chat.includes('You are the BAA AI Tutor') && chat.includes('Do not diagnose'), 'canonical tutor prompt/safety rules remain active'],
  ['Existing Gemini implementation preserved', api.includes("import baseHandler from './chat.js'") && chat.includes('callGeminiWithRetry'), 'provider/retry/streaming implementation is reused'],
];

let failed = 0;
for (const [name, ok, why] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name} — ${why}`);
  if (!ok) failed++;
}
console.log(`M04 authoritative evidence contract: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
