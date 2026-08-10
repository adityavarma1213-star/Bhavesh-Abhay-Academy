const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..','..');let fail=0;
function ok(c,m){if(c)console.log('PASS',m);else{console.error('FAIL',m);fail++;}}
const files=['api/_lib/db.js','api/_lib/security.js','api/_lib/auth.js','api/auth/signup.js','api/auth/login.js','api/auth/logout.js','api/auth/me.js','api/v1/learner.js','api/v1/consent.js','api/v1/audit.js','api/health.js','scripts/apply-migrations.mjs','scripts/export-backup.mjs','scripts/migrate-localstorage.mjs','db/migrations/001_initial.sql','.env.example'];
for(const f of files)ok(fs.existsSync(path.join(root,f)),`G4/G5/G6 artifact exists: ${f}`);
const schema=fs.readFileSync(path.join(root,'db/schema.sql'),'utf8');
ok(/CREATE TABLE users/.test(schema)&&/CREATE TABLE auth_sessions/.test(schema)&&/CREATE TABLE audit_log/.test(schema),'G5 schema contains identity/session/audit tables');
const sec=fs.readFileSync(path.join(root,'api/_lib/security.js'),'utf8');
ok(/pbkdf2/i.test(sec)&&/timingSafeEqual/.test(sec)&&/HttpOnly/.test(sec)&&/SameSite=Lax/.test(sec),'G4/G6 uses salted password hashing, timing-safe verification and secure session cookie flags');
const auth=fs.readFileSync(path.join(root,'api/_lib/auth.js'),'utf8');
ok(/canAccessLearner/.test(auth)&&/LEARNER_FORBIDDEN/.test(auth)&&/admin/.test(auth),'G4 server-side learner authorization is implemented');
const audit=fs.readFileSync(path.join(root,'api/v1/audit.js'),'utf8');
ok(/ADMIN_REQUIRED/.test(audit)&&/ORDER BY created_at DESC/.test(audit),'G6 admin-only audit endpoint is implemented');
const backup=fs.readFileSync(path.join(root,'scripts/export-backup.mjs'),'utf8');
ok(/audit_log/.test(backup)&&/learners/.test(backup),'G6 logical backup covers audit and learner data');
const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');
ok(/POSTGRES_URL/.test(env)&&/GEMINI_API_KEY/.test(env),'Production environment contract is documented');
if(fail){process.exit(1)}console.log('G4/G5/G6 artifact verification PASS');
