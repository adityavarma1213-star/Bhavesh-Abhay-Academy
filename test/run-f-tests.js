const fs=require('fs');
const path=require('path');
const assert=require('assert');
const pages=fs.readdirSync('.').filter(f=>f.endsWith('.html'));
let errors=[];
for(const file of pages){
  const s=fs.readFileSync(file,'utf8');
  const buttons=[...s.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  for(const m of buttons){
    const attrs=m[1], body=m[2].replace(/<[^>]+>/g,'').replace(/&[^;]+;/g,'').trim();
    if(!body && !/aria-label\s*=|title\s*=/i.test(attrs)) errors.push(`${file}: unlabeled button`);
  }
  const inputs=[...s.matchAll(/<input\b([^>]*)>/gi)];
  for(const m of inputs){
    const attrs=m[1];
    if(!/aria-label\s*=|placeholder\s*=|id\s*=/i.test(attrs)) errors.push(`${file}: input without label/placeholder/id`);
  }
}
assert.strictEqual(errors.length,0,errors.join('\n'));
console.log(`Accessibility structural tests: PASS (${pages.length} HTML pages)`);
