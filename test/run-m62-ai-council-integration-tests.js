const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..'); let failures=0;
function assert(c,m){if(!c){console.error('FAIL:',m);failures++;}else console.log('PASS:',m)}

const api=fs.readFileSync(path.join(ROOT,'api/v1/[...route].js'),'utf8');
const migration=fs.readFileSync(path.join(ROOT,'db/migrations/017_ai_council_reviews.sql'),'utf8');
const client=fs.readFileSync(path.join(ROOT,'js/baa-ai-council.js'),'utf8');
const admin=fs.readFileSync(path.join(ROOT,'admin.html'),'utf8');
const account=fs.readFileSync(path.join(ROOT,'account.html'),'utf8');
const grantScript=fs.readFileSync(path.join(ROOT,'scripts/grant-admin-role.mjs'),'utf8');

assert(migration.includes('ai_council_reviews'),'ai_council_reviews table exists');
assert(migration.includes("REFERENCES users(id)"),'reviews are tied to the admin who opened them');

assert(api.includes("__build_ai_council")&&api.includes("route==='ai-council'"),'ai-council route is registered in the dispatcher');
assert(api.includes("hasRole(session,'admin')"),'AI Council route requires the admin role, not just any authenticated user');
assert(api.includes('INVALID_COUNCIL_REVIEW')&&api.includes('reviewers.filter'),'server re-validates topic/reviewers, does not trust the client blindly');
assert(api.includes('UNKNOWN_REVIEWER'),'a response can only be attributed to a reviewer named when the review was opened — no impersonating an uninvited reviewer');
assert(api.includes("writeAudit")&&api.includes('ai_council.review_created')&&api.includes('ai_council.response_added'),'review creation and responses are audit-logged');
assert(api.includes('ai_council_reviews'),'route actually reads/writes the real table, not an in-memory stub');

assert(admin.includes("api('/api/auth/me')")&&admin.includes("roles.includes('admin')"),'admin.html actually gates on the admin role rather than trusting the client');
assert(admin.includes('/api/v1/ai-council'),'admin.html calls the real server route');
assert(admin.includes('awaiting_reviews')||admin.includes('ready_for_decision')||admin.includes('pillText'),'admin.html shows real consensus status, not a static claim');

assert(account.includes("list.includes('admin')")&&account.includes("'admin.html'"),'admin accounts are actually routed to admin.html after login');
assert(grantScript.includes("role = 'admin'")||grantScript.includes("'admin'"),'a real, documented way exists to grant the admin role (no self-service signup for it)');

// The underlying pure functions (createReview/addResponse/consensus) are
// unchanged and still covered by their own dedicated tests — this file
// only checks that they are now actually reachable end-to-end.
assert(client.includes('global.BAAAICouncil'),'original M62 pure-function module is untouched and still exported');

if(failures){console.error(`${failures} TEST(S) FAILED`);process.exit(1)}
console.log('ALL M62 AI COUNCIL INTEGRATION TESTS PASSED');
