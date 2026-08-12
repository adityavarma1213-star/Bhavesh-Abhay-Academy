#!/usr/bin/env node
/**
 * M5 — AI Mentor Chat production checkpoint.
 * Module purpose: academic-profile conversational guidance and motivation.
 * Uses the existing secure chat endpoint in explicit mentor mode.
 */
const fs=require('fs');
const assert=require('assert');
const student=fs.readFileSync('student-os.html','utf8');
const api=fs.readFileSync('api/chat.js','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}

test('Mentor world exists and is reachable',()=>{
  assert.ok(student.includes('id="world-mentor"'));
  assert.ok(student.includes("openWorld('mentor')"));
  assert.ok(student.includes("closeWorld('mentor')"));
});

test('Mentor is explicitly distinct from Tutor',()=>{
  assert.ok(student.includes('AI Mentor'));
  assert.ok(student.includes('MENTOR_HISTORY_KEY'));
  assert.ok(api.includes("mode === 'mentor'"));
});

test('Mentor sends an explicit mentor mode to the existing backend',()=>{
  assert.ok(student.includes("mode:'mentor'"));
  assert.ok(student.includes('fetch(CHAT_API_URL'));
});

test('Mentor uses real learning evidence when available',()=>{
  assert.ok(student.includes('BAAAssessment.getLearningContextForTutor()'));
  assert.ok(student.includes('learningContext:learningContext||undefined'));
});

test('Mentor conversation is schema-versioned and bounded',()=>{
  assert.ok(student.includes('MENTOR_HISTORY_SCHEMA_VERSION = 1'));
  assert.ok(student.includes('MENTOR_MAX_MESSAGES = 20'));
  assert.ok(student.includes('slice(-MENTOR_MAX_MESSAGES)'));
});

test('Mentor history validates restored message shape',()=>{
  assert.ok(student.includes("m.role==='user'||m.role==='assistant'"));
  assert.ok(student.includes("typeof m.content==='string'"));
});

test('Mentor responses are streamed and safely rendered',()=>{
  assert.ok(student.includes('function processMentorSSE(evt)'));
  assert.ok(student.includes('buffer+=decoder.decode'));
  assert.ok(student.includes('renderMarkdown(accumulated)'));
  assert.ok(student.includes('aiBubble.replaceChildren'));
});

test('Mentor user content uses textContent',()=>{
  assert.ok(student.includes('bubble.textContent=text'));
});

test('Mentor provides clear conversation with confirmation',()=>{
  assert.ok(student.includes('function clearMentorConversation()'));
  assert.ok(student.includes("window.confirm('Clear this saved Mentor conversation?')"));
});

test('Mentor system prompt is guidance-focused and professionally bounded',()=>{
  assert.ok(api.includes('BAA AI Mentor Chat'));
  assert.ok(api.includes('academic guidance and motivation'));
  assert.ok(api.includes("not the student's therapist, doctor, parent, teacher, or best friend"));
  assert.ok(api.includes('Do not diagnose, manipulate, shame, pressure, or create dependency'));
});

test('Mentor does not invent academic facts',()=>{
  assert.ok(api.includes('Do not invent grades, achievements, weaknesses, schedules, or personal facts'));
});

test('Mentor preserves server-side key protection',()=>{
  assert.ok(api.includes('process.env.GEMINI_API_KEY'));
  assert.ok(!student.includes('GEMINI_API_KEY'));
});

console.log(`\nM5: ${passed}/12 PASS`);
if(process.exitCode) process.exit(process.exitCode);
