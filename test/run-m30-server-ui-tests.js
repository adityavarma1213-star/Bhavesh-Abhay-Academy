#!/usr/bin/env node
'use strict';
const fs=require('fs');
const assert=require('assert');
const ui=fs.readFileSync('js/baa-m30-rewards-server-ui.js','utf8');
const boot=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const checks=[
 ['server rewards endpoint',ui.includes("/api/v1/rewards?learnerId=")],
 ['credentialed request',ui.includes("credentials:'include'")],
 ['learner session boundary',ui.includes('BAA_LEARNER_ID')],
 ['server response only',ui.includes('p && p.rewards')],
 ['server XP rendering',ui.includes("Number(r.xp||0)")],
 ['server badge rendering',ui.includes('earnedBadgeIds')],
 ['no local rewards fallback in panel',ui.includes('Browser-local preview data is not presented here as server data')],
 ['student-only mount',ui.includes("endsWith('/student-os.html')")],
 ['refresh control',ui.includes('baa-m30-refresh')],
 ['shared bootstrap wiring',boot.includes("baa-m30-rewards-server-ui.js")]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('PASS',name);}
console.log(`M30 server/UI contract: ${checks.length}/${checks.length} structural checks passed`);
