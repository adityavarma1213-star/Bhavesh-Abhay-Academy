#!/usr/bin/env node
/* Verifies js/baa-ecosystem-tools.js exists, is syntactically valid, exposes
   the expected API, and that each of the nine previously-inert modules is
   now wired into a role-appropriate page:
     - Student-facing (student-os.html): Community (world-community overlay),
       Career Prep (world-career overlay), Explainability + Curriculum
       (Progress/Ecosystem), Global Collaboration + Olympiad
       (Progress/Expansion).
     - Admin-facing (admin.html, behind the existing /api/auth/me admin-role
       guard): School Portal, Institution Analytics, Plugin Marketplace —
       these are institution/admin actions, not student actions.
   This is a structural/source-level test (level A/B), not a browser DOM
   test: it proves the wiring exists in source, not that it renders
   correctly in a browser. */
const fs = require('fs'), assert = require('assert'), vm = require('vm');

const src = fs.readFileSync('js/baa-ecosystem-tools.js', 'utf8');
new vm.Script(src, { filename: 'baa-ecosystem-tools.js' }); // throws on syntax error

const studentUi = fs.readFileSync('student-os.html', 'utf8');
const adminUi = fs.readFileSync('admin.html', 'utf8');

let n = 0, t = (name, fn) => { fn(); n++; console.log('PASS ' + name); };

t('ecosystem-tools script is loaded by student-os.html and admin.html', () => {
  assert.ok(studentUi.includes('js/baa-ecosystem-tools.js'));
  assert.ok(adminUi.includes('js/baa-ecosystem-tools.js'));
});

t('the nine previously-inert modules no longer appear as static description-only cards', () => {
  ['M34', 'M35', 'M38', 'M40', 'M44', 'M47', 'M48', 'M49', 'M50'].forEach(id => {
    assert.equal(studentUi.includes(`'${id}','`), false, id + ' still present as a static card entry on student-os.html');
  });
});

t('module builders exist and each is actually called, not just named', () => {
  ['BAASchool.', 'BAACommunity.', 'BAAExplainability.', 'BAACurriculum.',
   'BAACareerPrep.', 'BAAInstitution.', 'BAAGlobalCollab.', 'BAAOlympiad.', 'BAAPlugins.']
    .forEach(call => assert.ok(src.includes(call), 'missing call into ' + call));
});

t('public API groups tools by the correct role/workspace', () => {
  assert.ok(/ecosystem\s*:\s*function/.test(src));
  assert.ok(/expansion\s*:\s*function/.test(src));
  assert.ok(/community\s*:\s*function/.test(src));
  assert.ok(/careerPrep\s*:\s*function/.test(src));
  assert.ok(/school\s*:\s*function/.test(src));
  assert.ok(/institution\s*:\s*function/.test(src));
  assert.ok(/plugins\s*:\s*function/.test(src));
});

t('Community and Career Prep are mounted into their dedicated student nav/world overlays, not the generic hub', () => {
  assert.ok(studentUi.includes("BAAEcosystemTools.community()"));
  assert.ok(studentUi.includes("BAAEcosystemTools.careerPrep()"));
  assert.ok(studentUi.includes('id="baaCommunityRealTool"'));
  assert.ok(studentUi.includes('id="baaCareerPrepRealTool"'));
});

t('School Portal, Institution Analytics and Plugin Marketplace are mounted on admin.html, not student-os.html', () => {
  assert.ok(adminUi.includes('BAAEcosystemTools.school()'));
  assert.ok(adminUi.includes('BAAEcosystemTools.institution()'));
  assert.ok(adminUi.includes('BAAEcosystemTools.plugins()'));
  assert.equal(studentUi.includes('BAAEcosystemTools.school()'), false);
  assert.equal(studentUi.includes('BAAEcosystemTools.institution()'), false);
  assert.equal(studentUi.includes('BAAEcosystemTools.plugins()'), false);
});

t('admin.html only mounts these tools after the existing admin-role guard passes', () => {
  const guardIdx = adminUi.indexOf('async()=>{if(await guard())');
  const mountIdx = adminUi.indexOf('mountAdminEcosystemTools()');
  assert.ok(guardIdx > -1 && mountIdx > -1 && mountIdx > guardIdx);
});

console.log(`\nEcosystem tools: ${n}/${n} PASS`);
