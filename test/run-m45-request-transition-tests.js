#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const api=fs.readFileSync('api/m45-mentors.js','utf8');
const checks=[
 ['request states',api.includes("const REQUEST_STATUS=['requested','accepted','declined','cancelled','completed']")],
 ['transition matrix',api.includes('REQUEST_TRANSITIONS')],
 ['requested transitions',api.includes("requested:new Set(['accepted','declined','cancelled'])")],
 ['accepted transitions',api.includes("accepted:new Set(['completed','cancelled'])")],
 ['terminal protection',api.includes("completed:new Set([])")&&api.includes("declined:new Set([])")&&api.includes("cancelled:new Set([])")],
 ['transition enforcement',api.includes('INVALID_REQUEST_TRANSITION')],
 ['learner authorization',api.includes('requireLearnerAccess(s,request.rows[0].learner_id)')],
 ['audit transition',api.includes('fromStatus:currentStatus')]
];
for(const [name,ok] of checks)assert.ok(ok,`M45 request transition contract failed: ${name}`);
console.log(`M45 request transition contract PASS (${checks.length}/${checks.length})`);