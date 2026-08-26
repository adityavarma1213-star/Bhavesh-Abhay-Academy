/* M37 Trust Center access contract checks. */
const fs = require('fs');
const api = fs.readFileSync('api/m37-trust-access.js','utf8');
const themes = fs.readFileSync('js/baa-themes.js','utf8');
const checks = [
  ['M37 API requires authentication', api.includes("requireAuth(req)")],
  ['M37 API is GET-only', api.includes("req.method !== 'GET'")],
  ['M37 API limits allowed roles', api.includes("['student', 'parent', 'teacher', 'admin']")],
  ['M37 API disables caching', api.includes("Cache-Control",) && api.includes("no-store")],
  ['M37 client gate targets Trust Center only', themes.includes("trust-privacy.html")],
  ['M37 client gate uses authenticated credentials', themes.includes("/api/m37-trust-access") && themes.includes("credentials:'include'")],
  ['M37 client gate blocks before access check completes', themes.includes('baaTrustAccessVeil')],
  ['M37 unauthenticated path offers sign-in', themes.includes('account.html?next=trust-privacy.html')],
  ['M37 gate removes veil only after server success', themes.includes('veil.remove()')],
  ['M37 gate uses no local role fallback', !themes.includes('baa_section_g3_authorization_v1')],
];
let failures = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failures += 1;
}
console.log(`M37 Trust Center access checks: ${checks.length - failures}/${checks.length}`);
process.exitCode = failures ? 1 : 0;
