#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'js/baa-m12-guardian-ui.js'),'utf8');
const bootstrap=fs.readFileSync(path.join(root,'js/baa-guide-catalogue.js'),'utf8');
function assert(ok,msg){if(!ok)throw new Error(msg);}
assert(/BAAGuardian\.getServerSummary/.test(ui),'Guardian UI must consume server summary');
assert(/BAA_LEARNER_ID/.test(ui),'Guardian UI must use authenticated learner handoff');
assert(/credentials/.test(ui)||/getServerSummary/.test(ui),'Guardian UI must use the authenticated bridge');
assert(/data-baa-m12-server-ui/.test(ui),'Guardian UI mount marker missing');
assert(/academic support signal/.test(ui),'Guardian UI must explain its scope');
assert(/does not diagnose/.test(ui),'Guardian UI must retain safety limitation');
assert(/data-m12-ack/.test(ui),'Guardian UI acknowledgement control missing');
assert(/acknowledgeAlertServer/.test(ui),'Guardian UI must persist acknowledgements server-side');
assert(/baa-m12-guardian-ui\.js/.test(bootstrap),'Guardian UI must load from shared bootstrap');
assert(/data-baa-m12-ui/.test(bootstrap),'Guardian bootstrap marker missing');
console.log('M12 Guardian UI contract: 10/10 checks passed');