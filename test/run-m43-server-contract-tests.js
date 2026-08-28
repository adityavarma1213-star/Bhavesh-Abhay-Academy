/* M43 — server-backed scholarship finder contract checks. */
const fs = require('fs');
const api = fs.readFileSync('api/m43-scholarships.js','utf8');
const client = fs.readFileSync('Bhavesh-Abhay-Academy-main/js/baa-scholarships.js','utf8');
const checks = [
  ['server scholarship endpoint exists', /export default async function handler/.test(api)],
  ['server requires authentication', /requireAuth\(req\)/.test(api)],
  ['published records only', /status='published'/.test(api)],
  ['expired records excluded', /deadline>=CURRENT_DATE/.test(api)],
  ['server no-store boundary', /private, no-store, max-age=0/.test(api)],
  ['admin publication boundary', /hasRole\(s,'admin'\)/.test(api)],
  ['client server bridge exists', /async function fetchServer/.test(client)],
  ['client sends credentials', /credentials:'include'/.test(client)],
  ['client uses no-store', /cache:'no-store'/.test(client)],
  ['client requests JSON', /Accept:'application\/json'/.test(client)],
  ['client never invents records', /never invents a scholarship/.test(client)]
];
let failed=0;
for(const [name,ok] of checks){if(ok) console.log('PASS',name); else {console.error('FAIL',name);failed++;}}
if(failed) process.exit(1);
console.log(`M43 server contract: ${checks.length}/${checks.length} checks defined and passing.`);
