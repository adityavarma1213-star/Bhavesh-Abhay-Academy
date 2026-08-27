/* M37 Trust Center access contract checks. */
const fs = require('fs');
const api = fs.readFileSync('api/m37-trust-access.js','utf8');
const themes = fs.readFileSync('js/baa-themes.js','utf8');
const wellbeing = fs.readFileSync('js/baa-wellbeing.js','utf8');
const checks = [
  ['M37 API requires authentication', api.includes("requireAuth(req)")],
  ['M37 API is GET-only', api.includes("req.method !== 'GET'")],
  ['M37 API limits allowed roles', api.includes("['student', 'parent', 'teacher', 'admin']")],
  ['M37 API disables caching', api.includes("Cache-Control") && api.includes("no-store")],
  ['M37 API uses private no-store cache policy', api.includes("private, no-store, max-age=0")],
  ['M37 API applies no-store to method errors', api.includes("noStore(res);") && api.includes("status(405)")],
  ['M37 API applies no-store to access denial', api.includes("status(403)") && api.includes("noStore(res)")],
  ['M37 API applies no-store to auth/server errors', api.includes("catch (error)") && api.includes("noStore(res);")],
  ['M37 legacy client gate targets Trust Center only', themes.includes("trust-privacy.html")],
  ['M37 legacy client gate uses authenticated credentials', themes.includes("/api/m37-trust-access") && themes.includes("credentials:'include'")],
  ['M37 legacy client gate blocks before access check completes', themes.includes('baaTrustAccessVeil')],
  ['M37 legacy unauthenticated path offers sign-in', themes.includes('account.html?next=trust-privacy.html')],
  ['M37 legacy gate removes veil only after server success', themes.includes('veil.remove()')],
  ['M37 legacy gate uses no local role fallback', !themes.includes('baa_section_g3_authorization_v1')],
  ['M37 active Trust page gate runs only on Trust Center', wellbeing.includes("trust-privacy.html") && wellbeing.includes("location.pathname")],
  ['M37 active gate hides Trust page before reveal', wellbeing.includes("body.style.visibility = 'hidden'")],
  ['M37 active gate uses authenticated server check', wellbeing.includes("/api/m37-trust-access") && wellbeing.includes("credentials: 'include'")],
  ['M37 active gate reveals only after authenticated response', wellbeing.includes("session.authenticated !== true") && wellbeing.includes('reveal()')],
  ['M37 active gate has explicit unauthenticated sign-in path', wellbeing.includes('account.html?next=trust-privacy.html')],
  ['M37 active gate does not read local role/session keys', !wellbeing.includes('baa_section_g3_authorization_v1') && !wellbeing.includes('baa_section_g2_current_session_token_v1')],
];
let failures = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failures += 1;
}
console.log(`M37 Trust Center access checks: ${checks.length - failures}/${checks.length}`);
process.exitCode = failures ? 1 : 0;
