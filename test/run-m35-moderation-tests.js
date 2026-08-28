#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'api/m35-community-moderation.js'), 'utf8');
const checks = [
  ['moderation requires authentication', /requireAuth\(req\)/.test(api)],
  ['moderation requires teacher/admin', /teacher.*admin/.test(api)],
  ['open report queue exists', /WHERE r\.status = 'open'/.test(api)],
  ['reviewed/dismissed actions are bounded', /reviewed.*dismissed/.test(api)],
  ['report is updated with reviewer', /reviewed_by_user_id = \$\{session\.user_id\}/.test(api)],
  ['reviewed posts are hidden', /UPDATE community_posts SET status='hidden'/.test(api)],
  ['moderation is audited', /COMMUNITY_POST_MODERATED/.test(api)],
  ['dismissal is audited', /COMMUNITY_REPORT_DISMISSED/.test(api)],
  ['responses are uncached', /private, no-store, max-age=0/.test(api)],
];
let failed=0; for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+' '+name); if(!ok) failed++;}
if(failed) process.exit(1); console.log(`M35 moderation contract: ${checks.length}/${checks.length} checks defined.`);
