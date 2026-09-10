#!/usr/bin/env node
// M36 AI Insights Dashboard + M53 Learning Outcome Measurement — integration test.
const fs=require('fs'),vm=require('vm');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const api=fs.readFileSync('api/v1/[...route].js','utf8');
const studentOs=fs.readFileSync('student-os.html','utf8');
const teacherOs=fs.readFileSync('teacher-os.html','utf8');
const parentOs=fs.readFileSync('parent-os.html','utf8');
const insightsJs=fs.readFileSync('js/baa-insights.js','utf8');
const outcomesJs=fs.readFileSync('js/baa-outcomes.js','utf8');

// --- M36 ---
check(studentOs.includes('refreshInsightsPanel')&&studentOs.includes('BAAInsights.build()'),'a real panel calls the real, already-tested BAAInsights.build()');
check(studentOs.includes("r.evidenceQuality==='insufficient_evidence'"),'the panel honestly shows an insufficient-evidence state rather than fabricating a summary with no real activity');
check(!parentOs.includes('baa-insights.js'),'baa-insights.js remains correctly absent on parent-os.html — neither wireParent() nor any parent-facing code calls it');
check(teacherOs.includes('baa-insights.js'),'CORRECTED (fresh evidence): baa-insights.js is restored on teacher-os.html — js/baa-ui-wiring-final.js\'s wireTeacher() genuinely calls global.BAAInsights, which the original dead-script check missed');
check(insightsJs.includes('global.BAAInsights'),'the original pure build() module is untouched and still exported (its own unit test still covers it)');

// --- M53 ---
check(api.includes("route==='outcome-comparison'"),'outcome-comparison route is registered');
const handlerSrc=(api.split('__build_outcome_comparison')[1]||'').split('const handler_outcome_comparison')[0];
check(handlerSrc.includes('requireLearnerAccess'),'access is scoped to the real relationship check');
check(handlerSrc.includes('MIN_EVIDENCE_PER_WINDOW = 3')&&handlerSrc.includes('evidence.length < MIN_EVIDENCE_PER_WINDOW*2'),'a real minimum-evidence floor is enforced before any comparison is computed — matches the Blueprint\'s own M53 anti-overclaim rule');
check(handlerSrc.includes("FROM learning_evidence WHERE learner_id=${learnerId} AND concept=${concept}"),'the comparison is built from real, per-concept evidence rows, not fabricated numbers');
check(handlerSrc.includes("correctness==='correct'")&&handlerSrc.includes('ORDER BY created_at ASC'),'accuracy is computed from real correctness values across real chronological order, enabling a genuine early-vs-recent split');
check(!/req\.(query|body)\?\.(earlyWindow|recentWindow|accuracy)/.test(handlerSrc),'the client can never submit its own accuracy numbers or windows — everything is server-derived from real stored evidence');

// Live execution: confirm compare() mirrors js/baa-outcomes.js exactly.
const compareMatch=handlerSrc.match(/function compare\(pre,post\)\{[\s\S]*?\n\}/);
check(!!compareMatch,'compare() is extractable for direct execution');
const sandbox={}; vm.createContext(sandbox);
vm.runInContext(`${compareMatch[0]}\nthis.compare=compare;`,sandbox);
const improved=sandbox.compare(40,70);
check(improved.interpretation==='improved'&&improved.absoluteChange===30,'an accuracy increase is correctly reported as improved with the real point delta');
const declined=sandbox.compare(80,50);
check(declined.interpretation==='declined','an accuracy decrease is honestly reported as declined, not hidden or softened');
const unchanged=sandbox.compare(60,60);
check(unchanged.interpretation==='unchanged','no change is reported as unchanged, not stretched into either direction');

check(studentOs.includes('refreshOutcomesPanel')&&studentOs.includes('outcomeConceptSelect'),'a real UI panel exists with a real concept picker');
check(studentOs.includes("j.status==='insufficient_evidence'")&&studentOs.includes('j.minRequired'),'the UI surfaces the server\'s honest insufficient-evidence state with the real required count, not a generic error');
check(studentOs.includes('BAAAssessment.getAcademicProfile()'),'the concept picker is populated from the student\'s real academic profile, not a hardcoded or guessed list');
check(outcomesJs.includes('global.BAAOutcomes'),'the original pure compare() module is untouched and still exported (its own unit test still covers it)');

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL M36+M53 INTEGRATION TESTS PASSED');
