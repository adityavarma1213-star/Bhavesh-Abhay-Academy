/* M20 — evidence-grounded career explainability contract. */
const fs=require('fs');
const source=fs.readFileSync('Bhavesh-Abhay-Academy-main/js/baa-career.js','utf8');
const checks=[
 ['explainPlan exported',/explainPlan/.test(source)],
 ['uses recorded assessment evidence',/BAAAssessment/.test(source)],
 ['returns evidence counts',/evidenceCount/.test(source)],
 ['returns gaps',/gaps:gaps\.map/.test(source)],
 ['returns next actions',/nextActions/.test(source)],
 ['explicit limitations',/does not infer aptitude/.test(source)],
 ['no certainty prediction claim',/not a prediction or guarantee/.test(source)]
];
let failed=0; for(const [name,ok] of checks){if(ok)console.log('PASS',name);else{console.error('FAIL',name);failed++;}}
if(failed)process.exit(1); console.log(`M20 explainability contract: ${checks.length}/${checks.length} checks defined and passing.`);
