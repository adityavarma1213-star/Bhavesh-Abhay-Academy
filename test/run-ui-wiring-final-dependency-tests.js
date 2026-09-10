#!/usr/bin/env node
// js/baa-ui-wiring-final.js — a real, self-initializing UI wiring layer
// discovered during the strict statutory audit (27-28 Aug 2026). It
// calls real module globals directly from JS (not via inline HTML calls),
// which every earlier "is this script dead?" check in this codebase
// missed, because those checks only scanned inline HTML for calls.
//
// This test exists specifically to prevent that mistake recurring: for
// every global this file's wireStudent()/wireTeacher()/wireParent()
// reference, the corresponding script must actually be loaded on the
// page that function runs on.
const fs=require('fs'),vm=require('vm');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const src=fs.readFileSync('js/baa-ui-wiring-final.js','utf8');
check(src.includes("readyState==='loading'")&&src.includes('DOMContentLoaded'),'wiring runs on DOMContentLoaded (deferred) — confirms script tag order does not matter, only presence on the page');

function extractFnBody(name){
  const m=src.match(new RegExp(`function ${name}\\(\\)\\{`));
  if(!m) return '';
  const start=src.indexOf('{',m.index);
  let depth=0;
  for(let i=start;i<src.length;i++){
    if(src[i]==='{')depth++;
    if(src[i]==='}'){depth--; if(depth===0) return src.slice(start,i+1);}
  }
  return '';
}
const wireFns={
  'student-os.html': extractFnBody('wireStudent'),
  'teacher-os.html': extractFnBody('wireTeacher'),
  'parent-os.html': extractFnBody('wireParent'),
};

// Map each BAAX global to the real file that defines it (spot-checked
// against source — not every global maps to a same-named kebab-case
// file, so this is explicit rather than guessed).
const GLOBAL_TO_FILE={
  BAAAICouncil:'js/baa-ai-council.js', BAAAntiCheating:'js/baa-anti-cheating.js',
  BAAAppeals:'js/baa-appeals.js', BAACareerPrep:'js/baa-career-prep.js',
  BAACognitiveSafety:'js/baa-cognitive-safety.js', BAACommunity:'js/baa-community.js',
  BAACurriculum:'js/baa-curriculum.js', BAAERP:'js/baa-erp.js',
  BAAExplainability:'js/baa-explainability.js', BAAFounderLab:'js/baa-founder-lab.js',
  BAAFreshStart:'js/baa-fresh-start.js', BAAGlobalCollab:'js/baa-global-collab.js',
  BAAGovernance:'js/baa-governance.js', BAAInsights:'js/baa-insights.js',
  BAAInstitution:'js/baa-institution.js', BAALanguage:'js/baa-language.js',
  BAALowBandwidth:'js/baa-low-bandwidth.js', BAAMentors:'js/baa-mentors.js',
  BAAMistakes:'js/baa-mistakes.js', BAAOlympiad:'js/baa-olympiad.js',
  BAAOutcomes:'js/baa-outcomes.js', BAAPacing:'js/baa-adaptive-pacing.js',
  BAAParentConversation:'js/baa-parent-conversation.js', BAAPedagogy:'js/baa-pedagogy.js',
  BAAPlugins:'js/baa-plugins.js', BAAPurposeDesign:'js/baa-purpose-design.js',
  BAAScholarships:'js/baa-scholarships.js', BAASchool:'js/baa-school.js',
  BAATeacherDiagnostic:'js/baa-teacher-diagnostic.js', BAAVoice:'js/baa-voice.js',
};

let totalChecked=0;
for(const [page, body] of Object.entries(wireFns)){
  check(body.length>0,`${page}: the corresponding wire function was found and extracted`);
  const html=fs.readFileSync(page,'utf8');
  const refs=[...new Set([...body.matchAll(/global\.(BAA\w+)/g)].map(m=>m[1]))];
  refs.forEach(g=>{
    const file=GLOBAL_TO_FILE[g];
    if(!file) return; // BAAFinalUIReachability itself, or a helper not in the map
    totalChecked++;
    check(html.includes(`src="${file}"`),`${page}: ${g} is referenced by the wiring layer and its script (${file}) is actually loaded on this page`);
  });
}
check(totalChecked>=25,'a real, substantial number of global references were actually checked (not a token few)');

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log(`ALL js/baa-ui-wiring-final.js DEPENDENCY-PRESENCE TESTS PASSED (${totalChecked} references checked)`);
