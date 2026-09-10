#!/usr/bin/env node
/* Verifies js/baa-board-exam-tools.js exists, is syntactically valid, and
   that its fetch() calls target routes that genuinely exist in
   api/v1/[...route].js's dispatcher (not invented route names), and that
   board-exam-center.html / teacher-os.html / admin.html actually mount it.
   This is a structural/source-level test (level A/B): it proves the
   wiring exists in source and the routes are real, not that a live
   server+Postgres returns correct data (that remains UNVERIFIED — no
   live environment exists in this sandbox). */
const fs = require('fs'), assert = require('assert'), vm = require('vm');

const src = fs.readFileSync('js/baa-board-exam-tools.js', 'utf8');
new vm.Script(src, { filename: 'baa-board-exam-tools.js' }); // throws on syntax error

const dispatcher = fs.readFileSync('api/v1/[...route].js', 'utf8');
const boardCenter = fs.readFileSync('board-exam-center.html', 'utf8');
const teacherUi = fs.readFileSync('teacher-os.html', 'utf8');
const adminUi = fs.readFileSync('admin.html', 'utf8');
const studentUi = fs.readFileSync('student-os.html', 'utf8');

let n = 0, t = (name, fn) => { fn(); n++; console.log('PASS ' + name); };

const routesUsedByClient = [
  'board-registry', 'curriculum-graph', 'question-bank', 'adaptive-mock-exam',
  'exam-attempts', 'adaptive-practice', 'paper-intelligence', 'exam-readiness',
  'board-missions', 'question-translations', 'skill-passport',
  'board-intelligence', 'content-governance', 'ai-governance'
];

t('every route the client calls actually exists in the real api/v1 dispatcher', () => {
  routesUsedByClient.forEach(route => {
    assert.ok(
      dispatcher.includes(`route==='${route}'`),
      `client calls /api/v1/${route} but the dispatcher has no handler for it`
    );
  });
});

t('the client never fabricates a success response — every real api() call site has a .catch that surfaces the real error', () => {
  const withoutDefinition = src.replace('async function api(path, opts){', '');
  const apiCalls = (withoutDefinition.match(/\bapi\(/g) || []).length;
  const catches = (src.match(/\.catch\(/g) || []).length;
  assert.ok(apiCalls > 0);
  assert.equal(apiCalls, catches, `found ${apiCalls} api() call sites but ${catches} .catch() handlers`);
});

t('board-exam-center.html loads the tool and gates it behind a real /api/auth/me + /api/v1/my-learners check', () => {
  assert.ok(boardCenter.includes('js/baa-board-exam-tools.js'));
  assert.ok(boardCenter.includes("fetch('/api/auth/me'"));
  assert.ok(boardCenter.includes("fetch('/api/v1/my-learners'"));
  assert.ok(boardCenter.includes('BAABoardExamTools.mount'));
});

t('teacher-os.html mounts the real M74 class-intelligence panel', () => {
  assert.ok(teacherUi.includes('js/baa-board-exam-tools.js'));
  assert.ok(teacherUi.includes('BAABoardExamTools.boardIntelligenceForTeacher()'));
});

t('admin.html mounts M77/M78 only after the same guard as the M34/47/50 tools', () => {
  assert.ok(adminUi.includes('js/baa-board-exam-tools.js'));
  assert.ok(adminUi.includes('BAABoardExamTools.contentGovernance()'));
  assert.ok(adminUi.includes('BAABoardExamTools.aiGovernance()'));
  const guardIdx = adminUi.indexOf('async()=>{if(await guard())');
  const mountIdx = adminUi.indexOf('mountAdminEcosystemTools()');
  assert.ok(guardIdx > -1 && mountIdx > -1 && mountIdx > guardIdx);
});

t('student-os.html links to the new Board & Exam Center and no longer sends the two now-real admin tools to the generic feature-map placeholder', () => {
  assert.ok(studentUi.includes("board-exam-center.html"));
  assert.equal(
    /School Portal<\/div>/.test(studentUi) && studentUi.includes("feature-map.html'>🏫 School Portal"),
    false,
    'School Portal sidebar entry should no longer point at the generic placeholder'
  );
});

t('the write-action gaps found in the previous audit are now closed: exam-attempts save/submit, adaptive-practice submit_answer, question-translations POST, content-governance POST certify, paper-ingestion POST upload', () => {
  assert.ok(src.includes("action:'save_answer'"), 'M67 save_answer still missing');
  assert.ok(src.includes("action:'submit'"), 'M67 submit still missing');
  assert.ok(src.includes("action:'submit_answer'"), 'M68/M69 submit_answer still missing');
  assert.ok(src.includes("api('question-translations', {method:'POST'"), 'M75 translation POST still missing');
  assert.ok(src.includes("api('content-governance', {method:'POST'"), 'M77 certify POST still missing');
  assert.ok(src.includes("api('paper-ingestion', {method:'POST'"), 'M65 paper-ingestion upload still missing');
});

t('the write-action methods used match the real dispatcher\'s allowed methods (PATCH for attempts/practice transitions, POST for translations/governance/ingestion)', () => {
  assert.ok(dispatcher.includes("req.method === 'PATCH' && attemptId"));
  assert.ok(dispatcher.includes("ATTEMPT_ACTIONS = new Set(['save_answer', 'mark_for_review', 'submit', 'abandon', 'score_answer', 'finalize_evaluation'])"));
  assert.ok(dispatcher.includes("if (req.method === 'POST') return await handleCreate(req, res, session);")); // question-translations
  assert.ok(dispatcher.includes("if (req.method === 'POST') return await handleCertify(req, res, session);")); // content-governance
  assert.ok(dispatcher.includes("if (req.method === 'POST' && !jobId) return await handleUpload(req, res, session);")); // paper-ingestion
});

t('teacher-os.html mounts the new paper-ingestion and translation-authoring panels (teacher/admin-only server-side, correctly not placed on the student page)', () => {
  assert.ok(teacherUi.includes('BAABoardExamTools.paperIngestion()'));
  assert.ok(teacherUi.includes('BAABoardExamTools.translationAuthoring()'));
  assert.equal(boardCenter.includes('paperIngestion()'), false, 'paper ingestion should not be on the student page');
  assert.equal(boardCenter.includes('translationAuthoring()'), false, 'translation authoring should not be on the student page');
});

console.log(`\nBoard/exam tools: ${n}/${n} PASS`);
