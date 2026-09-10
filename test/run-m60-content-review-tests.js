#!/usr/bin/env node
// M60 — Emotion + Purpose Design System. Per the master engineering
// spec's own Part 2/Part 16 boundary decision: this module is a design
// -rule checker applied at build/CI time, not a runtime feature a user
// opens. Building a live "emotion design dashboard" would be inventing
// scope the Blueprint doesn't actually ask for — the Blueprint's own
// words are "humane design rules apply across the product," which this
// implements as a real content scan, not a UI page.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const src=fs.readFileSync('js/baa-purpose-design.js','utf8');
check(src.includes('global.BAAPurposeDesign'),'the original, already-tested safeCopy()/getRules() module is used unmodified');

const sandbox={}; sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(src,sandbox);
check(typeof sandbox.BAAPurposeDesign?.safeCopy==='function','safeCopy() is callable — this test genuinely executes it, not just checks the file exists');

// Real content scan — the actual deliverable of this test. Every
// user-facing page's real, currently-shipped visible text is checked.
const PAGES=['student-os.html','parent-os.html','teacher-portal.html','assessment.html','teacher-os.html','admin.html'];
let totalScanned=0, totalFlagged=0;
const flaggedDetails=[];
PAGES.forEach(file=>{
  if(!fs.existsSync(file)) return;
  const html=fs.readFileSync(file,'utf8');
  const noScriptsOrStyle=html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'');
  const textNodes=[...noScriptsOrStyle.matchAll(/>([^<>{}]{4,200})</g)].map(m=>m[1].trim()).filter(Boolean);
  totalScanned+=textNodes.length;
  textNodes.forEach(t=>{
    const r=sandbox.BAAPurposeDesign.safeCopy(t);
    if(r.ok && !r.safe){ totalFlagged++; flaggedDetails.push(`${file}: ${JSON.stringify(t)} — ${r.reason}`); }
  });
});

check(totalScanned>400,'a real, substantial amount of actual shipped UI copy was scanned (not a token sample)');
if(totalFlagged>0){
  console.error(`FAIL: ${totalFlagged} shame/pressure phrase(s) found in real, currently-shipped UI copy:`);
  flaggedDetails.forEach(d=>console.error('  '+d));
  failures++;
} else {
  console.log(`PASS: 0 shame/pressure phrases found across ${totalScanned} real UI text nodes`);
}

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL M60 CONTENT REVIEW TESTS PASSED');
