#!/usr/bin/env node
// M42 Anti-Cheating — integration test. Goes beyond structural checks:
// actually dispatches visibilitychange/blur events through a fake
// document and confirms the module really batches them and really
// calls fetch with the right attemptId/learnerId/events shape — the
// same bar Part 10 of the master spec sets ("a real request... reaches
// the real handler," simulated here since there's no live DB in this
// test environment).
const fs=require('fs'),assert=require('assert'),vm=require('vm');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

// --- Part A: structural checks on the server route and migration ---
const api=fs.readFileSync('api/v1/[...route].js','utf8');
const migration=fs.readFileSync('db/migrations/018_assessment_integrity_events.sql','utf8');
check(migration.includes('assessment_integrity_events'),'integrity events table exists');
check(migration.includes("flagged_reason"),'flagged_reason column added to assessment_attempts');
check(api.includes("route==='assessment-integrity'"),'assessment-integrity route is registered');
check(api.includes('INTEGRITY_FLAG_THRESHOLD'),'threshold is a named server-side constant');
check(!/req\.(body|query)[^\n]*THRESHOLD/.test(api),'threshold is never read from client input (cannot be raised by a cheating client)');
check(api.includes('requireLearnerAccess(session,learnerId)') && api.includes("id=${attemptId} AND learner_id=${learnerId}"),'server verifies the attempt actually belongs to the claimed learner, not just role');
check(api.includes("currentStatus==='not_reviewed'"),"never downgrades an attempt a human already resolved (accepted/edited/rejected)");
check(!/UPDATE assessment_attempts SET[^;]*score=/.test(api.split("__build_assessment_integrity")[1]||''),'integrity flagging never touches score/max_score — it only queues for human review');

// --- Part B: live execution — actually simulate a real exam session ---
class FakeDoc{
  constructor(){this.listeners={};this.hidden=false;}
  addEventListener(t,fn){(this.listeners[t]||=[]).push(fn);}
  removeEventListener(t,fn){this.listeners[t]=(this.listeners[t]||[]).filter(f=>f!==fn);}
  fire(t){(this.listeners[t]||[]).forEach(fn=>fn());}
}
const doc=new FakeDoc();
const fetchCalls=[];
const win={
  listeners:{},
  addEventListener(t,fn){(this.listeners[t]||=[]).push(fn)},
  removeEventListener(t,fn){this.listeners[t]=(this.listeners[t]||[]).filter(f=>f!==fn)},
  fire(t){(this.listeners[t]||[]).forEach(fn=>fn())},
  setInterval:()=>1, clearInterval:()=>{},
  fetch:(url,opts)=>{fetchCalls.push({url,opts});return Promise.resolve({ok:true,json:async()=>({ok:true})});},
};
win.window=win; win.document=doc; win.console=console;
vm.createContext(win);
vm.runInContext(fs.readFileSync('js/baa-anti-cheating.js','utf8'),win);
const api2=win.BAAAntiCheating;
check(!!api2 && typeof api2.attachToAttempt==='function' && typeof api2.detach==='function','module exports real attach/detach functions, not just the original pure functions');

const r=api2.attachToAttempt('attempt_test_1','learner_test_1');
check(r.ok===true,'attachToAttempt succeeds with a real document present');
check(doc.listeners.visibilitychange && doc.listeners.visibilitychange.length===1,'a real visibilitychange listener was actually registered');
check(win.listeners.blur && win.listeners.blur.length===1,'a real window blur listener was actually registered');

// Simulate the student switching tabs 3 times — should NOT flush yet (batches at 10).
for(let i=0;i<3;i++){ doc.hidden=true; doc.fire('visibilitychange'); doc.hidden=false; }
check(fetchCalls.length===0,'does not fire a network request per event — batches instead (3 events, still under the 10-event flush size)');

// Push past the 10-event auto-flush threshold.
for(let i=0;i<8;i++){ win.fire('blur'); }
check(fetchCalls.length===1,'auto-flushes once the batch reaches 10 events');
const sentBody=JSON.parse(fetchCalls[0].opts.body);
check(sentBody.attemptId==='attempt_test_1' && sentBody.learnerId==='learner_test_1','flushed batch is addressed to the correct attempt/learner');
check(Array.isArray(sentBody.events) && sentBody.events.length===10,'flushed batch actually contains the 10 real events, not a placeholder');
check(sentBody.events.every(e=>e.type&&e.at),'every event has a real type and real timestamp');

const summary=api2.detach();
check(fetchCalls.length===2,'detach() flushes any remaining unbatched events (1 leftover event from the loop) rather than dropping them');
check(doc.listeners.visibilitychange.length===0 && win.listeners.blur.length===0,'detach() actually removes the listeners — no leak into the next attempt');
check(summary && summary.level,'detach() returns an honest local risk summary for the student\'s own transparency');

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL M42 ANTI-CHEATING INTEGRATION TESTS PASSED');
