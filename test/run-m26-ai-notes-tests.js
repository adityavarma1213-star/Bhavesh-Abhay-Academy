#!/usr/bin/env node
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/m26-ai-notes.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/baa-m26-notes-server-ui.js', import.meta.url), 'utf8');
const checks = [
  ['M26 uses authenticated server access', /requireAuth\(req\)/.test(api)],
  ['M26 restricts generation to teacher/admin', /hasRole\(session, 'teacher'\).*hasRole\(session, 'admin'\)/s.test(api)],
  ['M26 checks learner ownership', /class_members cm/.test(api) && /teacher_user_id=\$\{session\.user_id\}/.test(api)],
  ['M26 grounds prompt in recorded evidence', /RECORDED LEARNING EVIDENCE/.test(api)],
  ['M26 forbids fabricated learner facts', /Do not invent grades, abilities, causes, emotions/.test(api)],
  ['M26 requires teacher review', /Teacher review is required/.test(api)],
  ['M26 has an insufficient-evidence path', /not enough recorded academic evidence/.test(api)],
  ['M26 rate-limits AI generation', /consumeAiRateLimit\('m26-notes'/.test(api)],
  ['M26 keeps the Gemini key server-side', /process\.env\.GEMINI_API_KEY/.test(api)],
  ['M26 client uses authenticated uncached AI transport', /credentials:'include'/.test(ui) && /cache:'no-store'/.test(ui) && /api\/m26-ai-notes/.test(ui)],
  ['M26 client renders generated text safely', /textContent=String/.test(ui) && /esc\(d\.draft/.test(ui)],
  ['M26 does not auto-persist the generated note', !/localStorage.*draft/.test(ui)],
];
const failed = checks.filter(([, ok]) => !ok);
console.log(`M26 AI Notes contract: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) { for (const [name] of failed) console.error(`FAIL: ${name}`); process.exit(1); }
