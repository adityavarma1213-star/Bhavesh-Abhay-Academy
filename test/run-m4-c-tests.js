#!/usr/bin/env node
/**
 * M4-C — Tutor conversation persistence/recovery.
 * Scope: bounded local history, strict persisted shape, safe restore, clear action.
 * No AI response is fabricated and no backend/API behavior is changed.
 */
const fs=require('fs');
const assert=require('assert');
const student=fs.readFileSync('student-os.html','utf8');
const api=fs.readFileSync('api/chat.js','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}

test('Tutor has an explicit persisted-history key and bounded window',()=>{
  assert.ok(student.includes("const CHAT_HISTORY_KEY = 'baaOsChatHistory'"));
  assert.ok(student.includes('MAX_OUTGOING_MESSAGES = 20'));
});

test('Persisted history validates role and content shape',()=>{
  assert.ok(student.includes("m.role === 'user' || m.role === 'assistant'"));
  assert.ok(student.includes("typeof m.content === 'string'"));
});

test('Persisted history is bounded before restore',()=>{
  assert.ok(student.includes('.slice(-MAX_OUTGOING_MESSAGES * 2)'));
});

test('Tutor restores saved messages into the chat UI',()=>{
  assert.ok(student.includes('function renderPersistedChat()'));
  assert.ok(student.includes('chatHistory.forEach(message =>'));
  assert.ok(student.includes('renderPersistedChat();'));
});

test('Restored user text uses textContent',()=>{
  assert.ok(student.includes('bubble.textContent = message.content'));
});

test('Restored assistant content uses the safe Markdown renderer',()=>{
  assert.ok(student.includes('const rendered = renderMarkdown(message.content)'));
  assert.ok(student.includes('bubble.append(...Array.from(rendered.childNodes))'));
});

test('Clear conversation removes persisted state through the existing reset path',()=>{
  assert.ok(student.includes('function resetChat()'));
  assert.ok(student.includes('chatHistory = []'));
  assert.ok(student.includes('saveChatHistory()'));
  assert.ok(student.includes('clearTutorConversationBtn'));
});

test('Tutor image bytes are not persisted',()=>{
  assert.ok(student.includes('const slim = chatHistory.slice(-40).map(m => ({'));
  assert.ok(student.includes('content:typeof m.content === \'string\''));
});

test('Tutor still sends bounded outgoing messages and learning context',()=>{
  assert.ok(student.includes('buildOutgoingMessages()'));
  assert.ok(student.includes('BAAAssessment.getLearningContextForTutor()'));
});

test('M4-C does not add a new backend endpoint',()=>{
  assert.ok(student.includes('CHAT_API_URL'));
  assert.ok(!student.includes('M4_C_API_URL'));
  assert.ok(api.includes('process.env.GEMINI_API_KEY'));
});

console.log(`\nM4-C: ${passed}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
