const assert=require('assert'); const fs=require('fs'); const path=require('path'); const root=path.join(__dirname,'..');
const v=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')); const c=(v.headers||[]).flatMap(x=>x.headers||[]).find(x=>x.key==='Content-Security-Policy');
assert(c); assert(!c.value.includes("'unsafe-eval'")); assert(c.value.includes("script-src")&&c.value.includes("'self'"));
const pdf=fs.readFileSync(path.join(root,'js/baa-homework-pdf.js'),'utf8'); assert(pdf.includes('isEvalSupported: false')||pdf.includes('isEvalSupported:false')); assert(pdf.includes('CVE-2024-4367'));
console.log('ALL CSP/EVAL HARDENING TESTS PASSED');
