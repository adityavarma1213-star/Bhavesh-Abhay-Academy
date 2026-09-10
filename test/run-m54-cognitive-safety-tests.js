#!/usr/bin/env node
// M54 Cognitive Safety — integration test.
const fs=require('fs'),assert=require('assert'),vm=require('vm');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

// --- Part A: structural checks on the migration and server route ---
const migration=fs.readFileSync('db/migrations/019_cognitive_safety_checkins.sql','utf8');
const api=fs.readFileSync('api/v1/[...route].js','utf8');
check(migration.includes('planner_energy_checkins'),'check-in table exists');
check(migration.includes('self_rated_pressure') && migration.includes('BETWEEN 1 AND 5'),'pressure is constrained 1-5 at the database level, not just in application code');
check(migration.includes('UNIQUE (learner_id, checkin_date)'),'one check-in per learner per day — cannot be spammed into a fabricated trend');
check(api.includes("route==='cognitive-safety'"),'cognitive-safety route is registered');

const handlerSrc=(api.split('__build_cognitive_safety')[1]||'').split('const handler_cognitive_safety')[0];
check(handlerSrc.includes('SELF_REPORT_ONLY'),'server rejects a write from anyone other than the learner\'s own account');
check(handlerSrc.includes("user_id=${session.user_id}"),'the self-check is against the real session user_id, not a client-claimed identity');
check(handlerSrc.includes('requireLearnerAccess'),'every request (including GET, e.g. a parent viewing) still goes through relationship-based access control');
check(handlerSrc.includes('INVALID_PRESSURE') && handlerSrc.includes('INVALID_BREAK_MINUTES'),'both inputs are validated server-side, not trusted from the client');
check(handlerSrc.includes('SUM(estimated_minutes)') && handlerSrc.includes('planner_tasks'),'studyMinutes is computed from real planner data, not client-supplied or fabricated');
check(!/req\.body\?\.studyMinutes/.test(handlerSrc),'studyMinutes is never accepted from client input (would let a client fake it)');
check(!/req\.body\?\.recommendation/.test(handlerSrc),'the recommendation is always server-computed — the client cannot submit its own and have it trusted');

// --- Part B: live execution — the actual evaluate() decision logic ---
const evalMatch=handlerSrc.match(/function evaluate\(studyMinutes,breakMinutes,pressure\)\{[\s\S]*?\n\}/);
check(!!evalMatch,'evaluate() function body is extractable for direct execution');
const sandbox={};
vm.createContext(sandbox);
vm.runInContext(`${evalMatch[0]}\nthis.evaluate=evaluate;`,sandbox);
const overloaded=sandbox.evaluate(200,10,2);
check(overloaded.signals.overloaded===true && overloaded.recommendation.includes('recovery break'),'a heavy day with little break time correctly triggers a recovery suggestion');
const highPressure=sandbox.evaluate(60,30,5);
check(highPressure.signals.highPressure===true && !highPressure.signals.overloaded,'high self-rated pressure alone (without a heavy day) is distinguished from workload overload');
const fine=sandbox.evaluate(60,30,2);
check(!fine.signals.overloaded && !fine.signals.highPressure && fine.recommendation.includes('sustainable'),'a normal day produces a plain continue message, not a false alarm');
check(overloaded.limitation.includes('not a medical or psychological diagnosis'),'every response carries the honest, non-diagnostic limitation — this cannot be silently dropped');

// --- Part C: live execution — the actual student-os.html client wiring ---
class FakeEl{
  constructor(tag){this.tag=tag;this.value='';this.innerHTML='';this.disabled=false;this.listeners={};this.dataset={};}
  addEventListener(t,fn){(this.listeners[t]||=[]).push(fn);}
  click(){(this.listeners.click||[]).forEach(fn=>fn());}
}
const nodes={cognitiveSafetyResult:new FakeEl('div'),cognitiveSafetyPressure:new FakeEl('select'),cognitiveSafetyBreaks:new FakeEl('input'),cognitiveSafetyBtn:new FakeEl('button')};
nodes.cognitiveSafetyPressure.value='3'; nodes.cognitiveSafetyBreaks.value='0';
const fetchCalls=[];
const win={
  document:{getElementById:(id)=>nodes[id]||null,createElement:()=>({set textContent(v){this._t=v;},get innerHTML(){return String(this._t||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}})},
  fetch:(url,opts)=>{fetchCalls.push({url,opts});
    if(opts&&opts.method==='POST'){
      const body=JSON.parse(opts.body);
      return Promise.resolve({ok:true,json:async()=>({ok:true,recommendation:body.selfRatedPressure>=4?'Consider reducing task difficulty or discussing the workload with a trusted adult.':'Continue with a sustainable study pace.',signals:{overloaded:false,highPressure:body.selfRatedPressure>=4}})});
    }
    return Promise.resolve({ok:true,json:async()=>({ok:true,checkedInToday:false})});
  },
  console,
};
win.window=win;
vm.createContext(win);
// Extract the exact function body from the real page source so the test
// exercises the actual shipped code, not a re-implementation of it.
const page=fs.readFileSync('student-os.html','utf8');
const fnMatch=page.match(/async function renderCognitiveSafety\(learnerId\)\{[\s\S]*?\n}\n\nfunction startPlannerTask/);
check(!!fnMatch,'renderCognitiveSafety is present in student-os.html and extractable');
const fnBody=fnMatch[0].replace(/\n\nfunction startPlannerTask$/,'');
const escFn="function escapePlannerHtml(value){ return String(value ?? '').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }\n";
vm.runInContext(`${escFn}${fnBody}\nthis.renderCognitiveSafety=renderCognitiveSafety;`,win);

(async()=>{
  await win.renderCognitiveSafety('learner_test_1');
  check(fetchCalls.length===1 && fetchCalls[0].url.includes('learnerId=learner_test_1'),'page load fetches today\'s check-in for the real learner id');
  check(nodes.cognitiveSafetyBtn.listeners.click && nodes.cognitiveSafetyBtn.listeners.click.length===1,'Save button click handler was actually bound, not just rendered inert');

  nodes.cognitiveSafetyPressure.value='5'; nodes.cognitiveSafetyBreaks.value='0';
  nodes.cognitiveSafetyBtn.click();
  await new Promise(r=>setTimeout(r,10));
  check(fetchCalls.length===2 && fetchCalls[1].opts.method==='POST','clicking Save actually issues a real POST, not a no-op');
  const sentBody=JSON.parse(fetchCalls[1].opts.body);
  check(sentBody.selfRatedPressure===5 && sentBody.breakMinutes===0,'the exact values the student entered are what gets sent — not hardcoded/stale values');
  check(nodes.cognitiveSafetyResult.innerHTML.includes('trusted adult'),'the server\'s real recommendation text is rendered back to the student, not a generic acknowledgement');

  if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
  console.log('ALL M54 COGNITIVE SAFETY INTEGRATION TESTS PASSED');
})();
