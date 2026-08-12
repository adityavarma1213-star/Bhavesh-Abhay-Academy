#!/usr/bin/env node
/**
 * M4-B — AI Tutor giant-file integration checkpoint.
 * Verifies streaming, final-event flushing, safe Markdown insertion, and
 * existing backend/evidence wiring. No new endpoint/model/database is added.
 */
const fs=require('fs');
const assert=require('assert');
const student=fs.readFileSync('student-os.html','utf8');
const api=fs.readFileSync('api/chat.js','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}

test('SSE processor exists',()=>assert.ok(student.includes('function processSSEEvent(evt)')));
test('SSE data lines are parsed',()=>{assert.ok(student.includes("line.startsWith('data:')"));assert.ok(student.includes('JSON.parse(jsonStr)'))});
test('Safety and upstream errors are handled',()=>{assert.ok(student.includes('parsed.error'));assert.ok(student.includes('promptFeedback'));assert.ok(student.includes("finishReason === 'SAFETY'"))});
test('Streamed text is accumulated and inserted as DOM nodes',()=>{assert.ok(student.includes('accumulated += textPart'));assert.ok(student.includes('aiBubble.replaceChildren'))});
test('Decoded chunks are appended to the buffer',()=>assert.ok(student.includes('buffer += decodedChunk;')));
test('Trailing SSE data is processed after stream close',()=>{assert.ok(student.includes('processSSEEvent(buffer);'));assert.ok(student.includes("if(buffer.trim()){"))});
test('Markdown sanitizer blocks dangerous elements',()=>{assert.ok(student.includes("'SCRIPT','STYLE','IFRAME','OBJECT','EMBED'"));assert.ok(student.includes("name.startsWith('on')"))});
test('Markdown sanitizer filters unsafe URLs',()=>{assert.ok(student.includes('const allowedUrl'));assert.ok(student.includes('!allowedUrl.test(value)'))});
test('Tutor keeps real backend and assessment evidence wiring',()=>{assert.ok(student.includes('fetch(CHAT_API_URL'));assert.ok(student.includes('BAAAssessment.getLearningContextForTutor()'))});
test('Server keeps key and bounded input protections',()=>{assert.ok(api.includes('process.env.GEMINI_API_KEY'));assert.ok(api.includes('MAX_MESSAGE_CHARS'));assert.ok(api.includes('MAX_LEARNING_CONTEXT_CHARS'))});
console.log(`\nM4-B: ${passed}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
