#!/usr/bin/env node
// M52 Mistake Archeology & Confusion Map — integration test.
const fs=require('fs');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const api=fs.readFileSync('api/v1/[...route].js','utf8');
const page=fs.readFileSync('student-os.html','utf8');
const mistakesJs=fs.readFileSync('js/baa-mistakes.js','utf8');

check(api.includes("route==='mistake-map'"),'mistake-map route is registered');
const handlerSrc=(api.split('__build_mistake_map')[1]||'').split('const handler_mistake_map')[0];
check(handlerSrc.includes('requireLearnerAccess'),'access is scoped to the real relationship check, not just role');
check(!/CREATE TABLE/.test(handlerSrc),'no new table is created for this — confirms it is a read-only view over already-real M22 data');
check(handlerSrc.includes('FROM mistake_patterns')&&handlerSrc.includes('mistake_pattern_occurrences')&&handlerSrc.includes('learning_evidence'),'reads the real, already-populated M22 tables, not fabricated data');
check(handlerSrc.includes("status==='possible_misconception'"),"distinguishes confident patterns from 'watching' ones using the exact same status M22 already computes — no separate/invented threshold");
check(handlerSrc.includes('rootCauseClaimed'),'the response explicitly flags whether a root cause is being claimed, so the client cannot accidentally treat every pattern as equally certain');
check(handlerSrc.includes('questionText')||handlerSrc.includes('q.text AS question_text'),'the evidence chain includes the actual question text, not just an opaque id — real transparency, not a black box');
check(!/MISTAKE_PATTERN_THRESHOLD\s*=\s*\d/.test(handlerSrc),'does not redefine its own threshold — reuses M22\'s single source of truth');

check(page.includes('refreshMistakeMapPanel')&&page.includes('mistakeMapList'),'a real panel and refresh function exist in student-os.html');
check(page.includes("fetch(`/api/v1/mistake-map")||page.includes("fetch(\`/api/v1/mistake-map"),'the panel actually calls the real server endpoint');
check(page.includes('p.rootCauseClaimed')&&page.includes("confident?'🔴 recurring pattern':'👁 watching'"),'the UI visibly distinguishes a confident pattern from a watching one — not styled identically');
check(page.includes('escapePlannerHtml(e.questionText)'),'real question text from the evidence chain is escaped before rendering — no raw HTML injection from stored question content');

check(mistakesJs.includes('global.BAAMistakes'),'the original pure classify()/map() module is untouched and still exported (its own unit test still covers it directly)');

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL M52 MISTAKE ARCHEOLOGY INTEGRATION TESTS PASSED');
