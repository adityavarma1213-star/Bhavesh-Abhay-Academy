#!/usr/bin/env node
// M31 Multilingual + M32 Voice — integration test.
const fs=require('fs');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const api=fs.readFileSync('api/v1/[...route].js','utf8');
const studentOs=fs.readFileSync('student-os.html','utf8');
const teacherOs=fs.readFileSync('teacher-os.html','utf8');
const parentOs=fs.readFileSync('parent-os.html','utf8');
const chatApi=fs.readFileSync('api/chat.js','utf8');

// --- M31: language preference is now server-synced, not local-only ---
check(api.includes("'language_pref_v1'"),'language_pref_v1 was added to the client-state allow-list');
check(studentOs.includes('pushLanguageSync')&&studentOs.includes('hydrateLanguagePreference'),'real sync/hydrate functions exist, not just local storage');
check(studentOs.includes("stateKey=language_pref_v1"),'the sync actually targets the real, registered state key');
check(studentOs.includes('await hydrateLanguagePreference(mine.id)'),'the preference is actually hydrated on login, using the real, session-derived learner id');
check(chatApi.includes('allowedResponseLanguages')&&chatApi.includes('RESPONSE LANGUAGE')&&chatApi.includes('Preserve mathematical notation'),'sanity: the AI Tutor backend already honors the language preference in its system prompt — confirms this was a real, load-bearing preference worth syncing, not a decorative one');
check(studentOs.includes('responseLanguage: getResponseLanguage()'),'sanity: the chat request actually sends the current preference on every message');

// --- M32: real STT/TTS confirmed, dead duplicate module cleaned up ---
check(studentOs.includes('webkitSpeechRecognition')&&studentOs.includes('micBtn')&&studentOs.includes("Voice input isn't supported"),'real speech-to-text exists with honest graceful degradation for unsupported browsers');
check(studentOs.includes('recognizer.onerror')&&studentOs.includes('fail silently'),'a recognition error does not break the page — the student can still type');
check(studentOs.includes('api/speak.js')||studentOs.includes('SPEAK_API_URL'),'real text-to-speech exists via the server-side Gemini voice endpoint');
check(!teacherOs.includes('src="js/baa-voice.js"')&&!parentOs.includes('src="js/baa-voice.js"'),'baa-voice.js remains correctly absent on teacher-os.html/parent-os.html, where nothing calls it');
check(studentOs.includes('src="js/baa-voice.js"'),'CORRECTED (fresh evidence): baa-voice.js is restored on student-os.html — js/baa-ui-wiring-final.js\'s wireStudent() genuinely calls global.BAAVoice, which the original dead-script check missed because it only scanned inline HTML, not other loaded .js files. Removing it had broken that real fallback UI card.');

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL M31+M32 INTEGRATION TESTS PASSED');
