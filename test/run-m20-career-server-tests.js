#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','api','m20-career.js'),'utf8');
const checks=[
  ['auth boundary',source.includes('requireAuth(req)')],
  ['learner ownership',source.includes('requireLearnerAccess(session,learnerId)')],
  ['server evidence',source.includes('FROM learning_evidence')],
  ['explanation field',source.includes('const explanation=')&&source.includes('explanation,')],
  ['next action',source.includes('const nextAction=')&&source.includes('nextAction};')],
  ['confidence label',source.includes("label:'Insufficient evidence'")],
  ['evidence linkage',source.includes('evidenceIds')&&source.includes('evidenceSources')],
  ['methodology',source.includes('methodology:')],
  ['limitations',source.includes('limitations:')],
  ['disclaimer',source.includes('disclaimer:')]
];
for(const [name,ok] of checks){if(!ok)throw new Error(`M20 server contract failed: ${name}`);}
console.log(`M20 career server explainability contract: ${checks.length}/${checks.length} PASS`);
