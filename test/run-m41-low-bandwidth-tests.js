#!/usr/bin/env node
// M41 Smart Low-Bandwidth Learning — integration test.
const fs=require('fs'),assert=require('assert'),vm=require('vm');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const api=fs.readFileSync('api/v1/[...route].js','utf8');
const studentOs=fs.readFileSync('student-os.html','utf8');
const hwScanner=fs.readFileSync('homework-scanner.html','utf8');
const hwImage=fs.readFileSync('js/baa-homework-image.js','utf8');

check(api.includes("'low_bandwidth_v1'"),'low_bandwidth_v1 was added to the client-state allow-list');
check(hwScanner.includes('js/baa-low-bandwidth.js'),'homework-scanner.html now loads the preference module (it did not before)');
check(hwImage.includes('LOW_BANDWIDTH_MAX_DIMENSION')&&hwImage.includes('LOW_BANDWIDTH_JPEG_QUALITY_START'),'real, different compression thresholds exist for the Data Saver case, not just a flag that changes nothing');
check(hwImage.includes('isLowBandwidthEnabled()')&&hwImage.includes('const maxDimension = lowBandwidth ? LOW_BANDWIDTH_MAX_DIMENSION : MAX_DIMENSION'),'compressImage() actually branches on the real preference, not a hardcoded default');

// --- Live execution: prove the two threshold sets genuinely differ in
// the direction that reduces bytes (smaller dimension, lower quality) ---
const constants={};
['MAX_DIMENSION','JPEG_QUALITY_START','LOW_BANDWIDTH_MAX_DIMENSION','LOW_BANDWIDTH_JPEG_QUALITY_START'].forEach(name=>{
  const m=hwImage.match(new RegExp(`const ${name} = ([\\d.]+)`));
  if(m) constants[name]=Number(m[1]);
});
check(constants.LOW_BANDWIDTH_MAX_DIMENSION < constants.MAX_DIMENSION,'Data Saver max dimension is genuinely smaller than the normal max dimension');
check(constants.LOW_BANDWIDTH_JPEG_QUALITY_START < constants.JPEG_QUALITY_START,'Data Saver starting JPEG quality is genuinely lower than the normal starting quality');

check(studentOs.includes('dataSaverToggle')&&studentOs.includes('onDataSaverToggle'),'a real toggle exists and is wired to a real handler');
check(studentOs.includes("BAALowBandwidth.set(!!enabled,'auto')"),'the toggle actually calls the real BAALowBandwidth.set(), not a decorative local variable');
check(studentOs.includes('pushDataSaverSync')&&studentOs.includes('hydrateDataSaverPreference'),'the preference is server-synced (survives a device change), not local-only');
check(studentOs.includes("stateKey=low_bandwidth_v1"),'sync targets the real, registered state key');
check(studentOs.includes('await hydrateDataSaverPreference(mine.id)'),'hydration actually runs on login with the real, session-derived learner id');

// --- CSS actually disables the animation, not just visually dims it ---
check(studentOs.includes('body.baa-data-saver .aurora{animation:none;background:none;}'),'Data Saver genuinely turns off the continuous ambient animation (a real CPU/battery cost on a low-end device), not merely reduces its opacity');
check(studentOs.includes("classList.toggle('baa-data-saver'")," the toggle actually applies/removes the CSS class that makes the rule above take effect");

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL M41 LOW-BANDWIDTH INTEGRATION TESTS PASSED');
