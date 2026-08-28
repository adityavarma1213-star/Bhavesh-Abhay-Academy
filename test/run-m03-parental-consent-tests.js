#!/usr/bin/env node
import fs from 'node:fs';

const files={
  migration:fs.readFileSync(new URL('../db/migrations/027_m03_parental_consent.sql',import.meta.url),'utf8'),
  api:fs.readFileSync(new URL('../api/m03-parental-consent.js',import.meta.url),'utf8'),
};
const checks=[
  ['migration creates parental_consents',/CREATE TABLE IF NOT EXISTS parental_consents/.test(files.migration)],
  ['consent is tied to learner',/learner_id TEXT NOT NULL REFERENCES learners\(id\)/.test(files.migration)],
  ['consent is tied to parent account',/parent_user_id TEXT NOT NULL REFERENCES users\(id\)/.test(files.migration)],
  ['grant/revoke state is constrained',/status TEXT NOT NULL CHECK \(status IN \('granted','revoked'\)\)/.test(files.migration)],
  ['grant requires consent timestamp',/status='granted' AND consented_at IS NOT NULL/.test(files.migration)],
  ['revocation is retained',/status='revoked' AND revoked_at IS NOT NULL/.test(files.migration)],
  ['API requires authentication',/requireAuth\(req\)/.test(files.api)],
  ['API requires parent role',/PARENT_ROLE_REQUIRED/.test(files.api)],
  ['API verifies active parent-learner relationship',/parent_learner WHERE parent_user_id=\$\{session\.user_id\} AND learner_id=\$\{learnerId\} AND status='active'/.test(files.api)],
  ['API is uncached',/private, no-store, max-age=0/.test(files.api)],
  ['API exposes legal verification as false',/legalVerification:false/.test(files.api)],
  ['API writes audit events',/writeAudit\(/.test(files.api)],
  ['grant action supported',/action==='grant'/.test(files.api)],
  ['revoke action supported',/action==='revoke'/.test(files.api)],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
console.log(`M03 parental consent contract: ${checks.length-failed}/${checks.length}`);
process.exitCode=failed?1:0;
