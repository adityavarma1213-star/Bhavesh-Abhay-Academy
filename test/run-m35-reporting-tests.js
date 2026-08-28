import fs from 'node:fs';

const files = {
  migration: fs.readFileSync(new URL('../db/migrations/028_m35_community_reports.sql', import.meta.url), 'utf8'),
  api: fs.readFileSync(new URL('../api/m35-community-report.js', import.meta.url), 'utf8'),
  client: fs.readFileSync(new URL('../js/baa-community.js', import.meta.url), 'utf8'),
};
const checks = [
  ['durable reports table', files.migration.includes('CREATE TABLE IF NOT EXISTS community_reports')],
  ['reporter FK', files.migration.includes('reporter_user_id TEXT NOT NULL REFERENCES users(id)')],
  ['bounded reasons', files.migration.includes("reason IN ('safety','harassment','spam','other')")],
  ['review status', files.migration.includes("status TEXT NOT NULL DEFAULT 'open'")],
  ['authenticated report API', files.api.includes('await requireAuth(req)')],
  ['report persistence', files.api.includes('INSERT INTO community_reports')],
  ['duplicate report protection', files.api.includes('REPORT_ALREADY_OPEN')],
  ['audit event', files.api.includes("COMMUNITY_REPORT_CREATED")],
  ['private no-store response', files.api.includes("private, no-store, max-age=0")],
  ['client report bridge', files.client.includes('async function reportPost')],
  ['client credentials', files.client.includes("credentials:'include'")],
  ['client no-store', files.client.includes("cache:'no-store'")],
  ['client JSON request', files.client.includes('Accept:\'application/json\'')],
];
let failed=0; for(const [name,ok] of checks){if(ok) console.log(`PASS ${name}`); else {console.error(`FAIL ${name}`); failed++;}}
console.log(`${checks.length-failed}/${checks.length} M35 reporting checks passed`);
if(failed)process.exit(1);
