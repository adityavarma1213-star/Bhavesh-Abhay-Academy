#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const ui=fs.readFileSync('student-os.html','utf8'),api=fs.readFileSync('api/chat.js','utf8');
let n=0;function t(name,fn){try{fn();n++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name);console.error(e.stack);process.exitCode=1}}
t('M28 selector exists',()=>assert.ok(ui.includes('id="explainLikeMode"')));
t('M28 has bounded modes',()=>['default','child','story','everyday','exam','visual'].forEach(x=>assert.ok(ui.includes(`'${x}'`))));
t('M28 preference is versioned',()=>assert.ok(ui.includes('EXPLAIN_LIKE_SCHEMA_VERSION')));
t('M28 safe fallback exists',()=>assert.ok(ui.includes("return 'default'")));
t('M28 mode is sent to backend',()=>assert.ok(ui.includes('explainLikeMode: getExplainLikeMode()')));
t('Backend validates mode',()=>assert.ok(api.includes('allowedExplainLike')&&api.includes('safeExplainLike')));
t('Child mode protects factual accuracy',()=>assert.ok(api.includes('without changing facts')));
t('Story mode labels analogy',()=>assert.ok(api.includes('clearly label it as an analogy')));
t('Everyday mode states analogy limits',()=>assert.ok(api.includes('state its limits')));
t('Visual mode avoids fake image claim',()=>assert.ok(api.includes('do not claim an image was generated')));
console.log(`\nM28: ${n}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
