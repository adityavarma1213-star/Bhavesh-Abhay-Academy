const fs=require('fs');
const assert=require('assert');
const account=fs.readFileSync('account.html','utf8');
const portal=fs.readFileSync('teacher-portal.html','utf8');
const serverView=fs.readFileSync('js/baa-server-learner-view.js','utf8');

assert(account.includes("fetch(API+'/me'"), 'Account login must resolve the authenticated session after login');
assert(account.includes("roles.includes('teacher')"), 'Account routing must recognize teacher role');
assert(account.includes("roles.includes('parent')"), 'Account routing must recognize parent role');
assert(account.includes("return 'student-os.html'"), 'Account routing must retain student fallback');
assert(portal.includes("fetch('/api/auth/me'"), 'Teacher academic portal must verify authenticated session');
assert(portal.includes("roles.includes('teacher')"), 'Teacher academic portal must enforce teacher role');
assert(portal.includes("location.href='account.html'"), 'Unauthenticated academic portal access must return to Account');
assert(serverView.includes("expectedRole()"), 'Parent/Teacher server view must determine page role');
assert(serverView.includes("ROLE_${expected.toUpperCase()}_REQUIRED"), 'Parent/Teacher server view must reject wrong role');
assert(serverView.includes("teacher-portal.html"), 'Wrong-role teacher access must have a safe destination');
console.log('ROLE ROUTING TESTS PASSED');
