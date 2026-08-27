#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','js','baa-m26-notes-server-ui.js'),'utf8');
const catalogue=fs.readFileSync(path.join(__dirname,'..','js','baa-guide-catalogue.js'),'utf8');
const api=fs.readFileSync(path.join(__dirname,'..','api','m26-notes.js'),'utf8');
const checks=[
  ['authenticated client request',source.includes("credentials:'include'")],
  ['no-store server response',source.includes("cache:'no-store'")],
  ['M26 endpoint',source.includes('/api/m26-notes?learnerId=')],
  ['server draft rendering',source.includes('d.draft')],
  ['evidence count rendering',source.includes('evidenceCount')],
  ['teacher review warning',source.includes('Teacher review is required')],
  ['academic-only boundary',source.includes('not a diagnosis')],
  ['teacher page targeting',source.includes('teacher-os.html')],
  ['catalogue bootstrap',catalogue.includes('baa-m26-notes-server-ui.js')],
  ['server role enforcement',api.includes("Teacher or administrator role required.")]
];
for(const [name,ok] of checks)if(!ok)throw new Error(`M26 UI contract missing: ${name}`);
console.log(`M26 Teacher Notes UI contract: ${checks.length}/${checks.length} PASS`);
