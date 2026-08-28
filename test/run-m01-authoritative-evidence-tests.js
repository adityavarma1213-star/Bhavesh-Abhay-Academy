#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const api=fs.readFileSync(path.join(root,'api/m01-ai-mode.js'),'utf8');
const client=fs.readFileSync(path.join(root,'js/baa-ai-mode.js'),'utf8');
function assert(ok,msg){if(!ok)throw new Error(msg);}
assert(/requireAuth/.test(api),'M01 adapter must authenticate');
assert(/requireLearnerAccess/.test(api),'M01 adapter must enforce learner ownership');
assert(/learning_memory/.test(api),'M01 adapter must read server learning evidence state');
assert(/planner_goals/.test(api),'M01 adapter must read server planner goals');
assert(/planner_preferences/.test(api),'M01 adapter must read server planner preferences');
assert(/planner_upcoming_assessments/.test(api),'M01 adapter must read server upcoming assessments');
assert(/req\.json\s*=/.test(api),'M01 adapter must replace untrusted client evidence with authoritative input');
assert(/Cache-Control/.test(api),'M01 adapter must prevent caching learner-specific AI evidence');
assert(/no-store/.test(api),'M01 adapter must use no-store for learner-specific AI evidence');
assert(/api\/m01-ai-mode/.test(client),'M01 client must use authoritative server adapter');
assert(/credentials:\s*['"]include['"]/.test(client),'M01 client must send authenticated credentials');
assert(/cache:\s*['"]no-store['"]/.test(client),'M01 client must prevent caching learner-specific AI plans');
assert(/Accept['"]:\s*['"]application\/json/.test(client),'M01 client must request JSON responses explicitly');
assert(/BAA_LEARNER_ID/.test(client),'M01 client must use authenticated learner handoff');
console.log('M01 authoritative evidence contract: 14/14 checks passed');
