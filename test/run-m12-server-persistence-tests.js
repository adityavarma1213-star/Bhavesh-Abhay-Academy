#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'db/migrations/015_guardian_persistence.sql'),'utf8');
const api=fs.readFileSync(path.join(root,'api/m12-guardian.js'),'utf8');
const client=fs.readFileSync(path.join(root,'js/baa-guardian.js'),'utf8');
function assert(ok,msg){if(!ok)throw new Error(msg);}
assert(/guardian_alert_acknowledgements/.test(migration),'M12 acknowledgement table missing');
assert(/REFERENCES learners\(id\)/.test(migration),'M12 acknowledgement table must be learner scoped');
assert(/requireAuth\(req\)/.test(api),'M12 API must require authentication');
assert(/requireLearnerAccess\(session, learnerId\)/.test(api),'M12 API must enforce learner ownership/role access');
assert(/GET|POST|DELETE/.test(api),'M12 API methods missing');
assert(/syncServer/.test(client),'M12 client server sync missing');
assert(/acknowledgeAlertServer/.test(client),'M12 server acknowledgement write missing');
assert(/resetAcknowledgementsServer/.test(client),'M12 server acknowledgement reset missing');
console.log('M12 server persistence contract: PASS');
