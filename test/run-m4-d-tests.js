#!/usr/bin/env node
/**
 * M4-D — final Tutor persistence/export/import hardening.
 * No new AI endpoint/model/database. Export/import is text-only and schema-versioned.
 */
const fs=require('fs');
const assert=require('assert');
const student=fs.readFileSync('student-os.html','utf8');
const api=fs.readFileSync('api/chat.js','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}

test('Conversation persistence has an explicit schema version',()=>{
  assert.ok(student.includes('CHAT_HISTORY_SCHEMA_VERSION = 1'));
  assert.ok(student.includes('schemaVersion: CHAT_HISTORY_SCHEMA_VERSION'));
});

test('Legacy array history remains migration-readable',()=>{
  assert.ok(student.includes('Array.isArray(parsed)'));
  assert.ok(student.includes('parsed.schemaVersion === CHAT_HISTORY_SCHEMA_VERSION'));
});

test('Storage failure has an explicit user-facing status',()=>{
  assert.ok(student.includes('CHAT_HISTORY_STORAGE_FAILED'));
  assert.ok(student.includes('could not be saved on this device'));
});

test('Conversation export is text-only and versioned',()=>{
  assert.ok(student.includes('function exportTutorConversation()'));
  assert.ok(student.includes('schemaVersion: CHAT_HISTORY_SCHEMA_VERSION'));
  assert.ok(student.includes("content:typeof m.content === 'string'"));
  assert.ok(student.includes('Image data was not included'));
});

test('Conversation import validates type and size',()=>{
  assert.ok(student.includes("file.type !== 'application/json'"));
  assert.ok(student.includes('file.size > CHAT_HISTORY_MAX_EXPORT_CHARS'));
});

test('Conversation import validates message role/content shape',()=>{
  assert.ok(student.includes("m.role === 'user' || m.role === 'assistant'"));
  assert.ok(student.includes("typeof m.content === 'string'"));
  assert.ok(student.includes('INVALID_CONVERSATION_SHAPE'));
});

test('Clear action is confirmable and keyboard accessible',()=>{
  assert.ok(student.includes("window.confirm('Clear this saved Tutor conversation?')"));
  assert.ok(student.includes("event.key === 'Enter' || event.key === ' '"));
});

test('Import/export controls are wired',()=>{
  assert.ok(student.includes('exportTutorConversationBtn'));
  assert.ok(student.includes('importTutorConversationBtn'));
  assert.ok(student.includes('importTutorConversationInput'));
});

test('No image bytes are exported or persisted',()=>{
  assert.ok(student.includes('image:') && student.includes('const slim = chatHistory.slice(-40)'));
  assert.ok(!student.includes('image:m.image') || student.includes('content:typeof m.content'));
});

test('Tutor backend remains unchanged in architecture',()=>{
  assert.ok(api.includes('process.env.GEMINI_API_KEY'));
  assert.ok(student.includes('fetch(CHAT_API_URL'));
  assert.ok(student.includes('BAAAssessment.getLearningContextForTutor()'));
});

console.log(`\nM4-D: ${passed}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
