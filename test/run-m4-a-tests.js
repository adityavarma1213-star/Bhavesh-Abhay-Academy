#!/usr/bin/env node
/**
 * M4-A — AI Tutor connection hardening.
 * Scope: server-side API-key architecture, origin configuration contract,
 * input guards, and removal of temporary production debug logging.
 */
const fs = require('fs');
const assert = require('assert');

const api = fs.readFileSync('api/chat.js','utf8');
const student = fs.readFileSync('student-os.html','utf8');
const readme = fs.readFileSync('README.md','utf8');

let passed=0;
function test(name,fn){
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch(e){ console.error(`FAIL ${name}\n${e.stack||e}`); process.exitCode=1; }
}

test('Gemini API key is server-side only',()=>{
  assert.ok(api.includes('process.env.GEMINI_API_KEY'));
  assert.ok(!student.includes('GEMINI_API_KEY'));
  assert.ok(!student.includes('generativelanguage.googleapis.com'));
});

test('Tutor backend validates message shape and size',()=>{
  assert.ok(api.includes('messages must be a non-empty array'));
  assert.ok(api.includes('MAX_MESSAGE_CHARS'));
  assert.ok(api.includes('MAX_HISTORY_MESSAGES'));
  assert.ok(api.includes('ABUSE_CEILING_MESSAGES'));
});

test('Tutor backend validates attached image types and size',()=>{
  assert.ok(api.includes('ALLOWED_IMAGE_MIME_TYPES'));
  assert.ok(api.includes('MAX_IMAGE_BASE64_CHARS'));
});

test('Tutor backend uses configured CORS origin',()=>{
  assert.ok(api.includes('process.env.ALLOWED_ORIGIN'));
  assert.ok(api.includes('Access-Control-Allow-Origin'));
});

test('Tutor has rate limiting and upstream timeout',()=>{
  assert.ok(api.includes('consumeAiRateLimit'));
  assert.ok(api.includes('ai-rate-limit'));
  assert.ok(api.includes('REQUEST_TIMEOUT_MS'));
  assert.ok(api.includes('MAX_RETRIES'));
});

test('Temporary backend debug logging is removed',()=>{
  assert.ok(!api.includes('[DEBUG]'));
});

test('Temporary frontend FE debug logging is removed',()=>{
  assert.ok(!student.includes('[FE-DEBUG]'));
  assert.ok(!student.includes('TEMPORARY DEBUG LOGGING'));
});

test('Tutor remains wired to the deployed chat endpoint and evidence context',()=>{
  assert.ok(student.includes('CHAT_API_URL'));
  assert.ok(student.includes('BAAAssessment.getLearningContextForTutor()'));
  assert.ok(student.includes('learningContext'));
});

test('Documentation retains backend deployment guidance',()=>{
  assert.ok(readme.includes('AI Tutor backend'));
  assert.ok(readme.includes('api/chat.js'));
  assert.ok(readme.includes('ALLOWED_ORIGIN'));
});

console.log(`\nM4-A: ${passed}/9 PASS`);
if(process.exitCode) process.exit(process.exitCode);
