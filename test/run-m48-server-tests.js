#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const api=fs.readFileSync('api/m48-collaboration.js','utf8');
const migration=fs.readFileSync('db/migrations/026_m48_collaboration_moderation.sql','utf8');
const checks=[
 ['auth',api.includes('requireAuth(req)')],
 ['role boundary',api.includes("hasRole(s,'student')")&&api.includes("hasRole(s,'teacher')")],
 ['server moderation state',api.includes('moderation_state')],
 ['blocked content filter',api.includes('POST_BLOCKED_BY_SAFETY_FILTER')&&api.includes('COMMENT_BLOCKED_BY_SAFETY_FILTER')],
 ['pending student posts',api.includes("moderationStateFor(s)")&&api.includes("'pending'")],
 ['staff moderation',api.includes("action==='moderate'")&&api.includes("'approved','blocked'" )],
 ['report endpoint',api.includes("action==='report'")&&api.includes('collaboration_reports')],
 ['visibility enforcement',api.includes("p.moderationState==='approved'")],
 ['audit logging',api.includes('writeAudit')],
 ['migration moderation column',migration.includes('moderation_state')],
 ['migration reports table',migration.includes('CREATE TABLE IF NOT EXISTS collaboration_reports')],
 ['report index',migration.includes('idx_collaboration_reports_status')]
];
for(const [name,ok] of checks)assert.ok(ok,`M48 contract failed: ${name}`);
console.log(`M48 server contract PASS (${checks.length}/${checks.length})`);
