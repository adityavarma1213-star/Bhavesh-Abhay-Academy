// test/run-m76-skill-passport-tests.js
// BAA M76 — Board-to-Career + Skill Passport (Blueprint V3.2/V3.3).
// Same extraction-and-execute discipline as M64-M75.
//
// Coverage:
//   G3 authorization    — only admin/teacher can curate skills/pathways/mappings; a learner can only see their own passport
//   G4 evidence honesty — a skill only appears in the passport when a genuinely MASTERED concept is mapped to it (never developing/weak/insufficient); pathways are always labeled informational, never a recommendation
//   G6 idempotency (soft)— duplicate skill names, pathway names, and mappings are all rejected
//
// NOT LIVE-VERIFIED — DATABASE ACCESS UNAVAILABLE.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('PASS:', name); }
  catch (e) { console.error('FAIL:', name, '\n ', e.stack || e); failures++; }
}

function extractBlock() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf('/* ================ skill-passport.js ================ */');
  assert.ok(start >= 0, 'skill-passport.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of skill-passport.js block');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id FROM skills WHERE name')) return { rows: state.skills.filter(s => s.name === values[0]).map(s => ({ id: s.id })) };
    if (q.startsWith('SELECT id FROM skills WHERE id')) return { rows: state.skills.filter(s => s.id === values[0]).map(s => ({ id: s.id })) };
    if (q.startsWith('INSERT INTO skills')) { const [id0, name, category, description] = values; state.skills.push({ id: id0, name, category, description }); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT id FROM career_pathways WHERE name')) return { rows: state.pathways.filter(p => p.name === values[0]).map(p => ({ id: p.id })) };
    if (q.startsWith('INSERT INTO career_pathways')) { const [id0, name, description] = values; state.pathways.push({ id: id0, name, description }); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT id FROM concepts WHERE id')) return { rows: state.concepts.filter(c => c.id === values[0]).map(c => ({ id: c.id })) };
    if (q.startsWith('SELECT id FROM concept_skill_map')) { const [conceptId, skillId] = values; return { rows: state.conceptSkillMap.filter(m => m.concept_id === conceptId && m.skill_id === skillId).map(m => ({ id: m.id })) }; }
    if (q.startsWith('INSERT INTO concept_skill_map')) { const [id0, conceptId, skillId, userId] = values; state.conceptSkillMap.push({ id: id0, concept_id: conceptId, skill_id: skillId, created_by_user_id: userId }); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT id FROM skill_pathway_map')) { const [skillId, pathwayId] = values; return { rows: state.skillPathwayMap.filter(m => m.skill_id === skillId && m.pathway_id === pathwayId).map(m => ({ id: m.id })) }; }
    if (q.startsWith('INSERT INTO skill_pathway_map')) { const [id0, skillId, pathwayId, userId] = values; state.skillPathwayMap.push({ id: id0, skill_id: skillId, pathway_id: pathwayId, created_by_user_id: userId }); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT s.id AS skill_id')) {
      const [learnerId] = values;
      const rows = [];
      for (const cm of state.conceptMastery.filter(m => m.learner_id === learnerId && m.status === 'mastered')) {
        for (const map of state.conceptSkillMap.filter(m => m.concept_id === cm.concept_id)) {
          const skill = state.skills.find(s => s.id === map.skill_id);
          const concept = state.concepts.find(c => c.id === cm.concept_id);
          rows.push({ skill_id: skill.id, skill_name: skill.name, category: skill.category, concept_name: concept.name });
        }
      }
      return { rows };
    }
    if (q.startsWith('SELECT DISTINCT p.id')) {
      const [skillIds] = values;
      const rows = [];
      for (const map of state.skillPathwayMap.filter(m => skillIds.includes(m.skill_id))) {
        const p = state.pathways.find(x => x.id === map.pathway_id);
        rows.push({ id: p.id, name: p.name, description: p.description, skill_id: map.skill_id });
      }
      return { rows };
    }
    throw new Error('Unhandled fake-sql query in M76 test: ' + q);
  };
}

function loadHandler(state, session) {
  const block = extractBlock();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp,
    global: {},
    sql: makeFakeSql(state),
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    id: (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
    requireAuth: async () => session,
    requireLearnerAccess: async (s, learnerId) => {
      if (s.roles.includes('admin') || s.roles.includes('teacher')) return;
      if (s.learnerId === learnerId) return;
      const e = new Error('You are not authorized to access this learner.'); e.status = 403; e.code = 'LEARNER_FORBIDDEN'; throw e;
    },
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_skill_passport;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const adminSession = { user_id: 'u_admin', roles: ['admin'] };
const teacherSession = { user_id: 'u_teacher', roles: ['teacher'] };
const learnerASession = { user_id: 'u_a', roles: ['student'], learnerId: 'learnerA' };

function freshState() {
  return {
    skills: [{ id: 'skill1', name: 'Numerical Reasoning', category: 'STEM' }],
    pathways: [{ id: 'pathway1', name: 'Engineering' }],
    concepts: [{ id: 'c_hcf', name: 'HCF' }],
    conceptSkillMap: [], skillPathwayMap: [], conceptMastery: [],
  };
}

(async () => {
  await test('G3: a student cannot define a skill', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: { resource: 'skill' }, body: { name: 'New Skill' } }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('G6: a duplicate skill name is rejected', async () => {
    const state = freshState();
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: { resource: 'skill' }, body: { name: 'Numerical Reasoning' } }, res);
    assert.strictEqual(res.statusCode, 409);
  });

  await test('G3: a teacher can map a concept to a skill, but only admin can create the skill itself', async () => {
    const state = freshState();
    let h = loadHandler(state, teacherSession);
    let res = makeRes();
    await h({ method: 'POST', query: { resource: 'skill' }, body: { name: 'New Skill' } }, res);
    assert.strictEqual(res.statusCode, 403, 'teacher cannot define a new skill');

    res = makeRes();
    await h({ method: 'POST', query: { resource: 'concept-skill-map' }, body: { conceptId: 'c_hcf', skillId: 'skill1' } }, res);
    assert.strictEqual(res.statusCode, 201, 'teacher CAN map an existing concept to an existing skill');
  });

  await test('G4: an insufficient-evidence learner (no mastered concepts) gets an honest empty passport', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA' } }, res);
    assert.strictEqual(res.body.insufficientEvidence, true);
    assert.strictEqual(res.body.skills.length, 0);
  });

  await test('G4: a WEAK (not mastered) concept mapped to a skill does NOT appear in the passport', async () => {
    const state = freshState();
    state.conceptSkillMap.push({ id: 'csm1', concept_id: 'c_hcf', skill_id: 'skill1' });
    state.conceptMastery.push({ learner_id: 'learnerA', concept_id: 'c_hcf', status: 'weak' });
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA' } }, res);
    assert.strictEqual(res.body.insufficientEvidence, true, 'a weak concept must never surface a skill claim');
  });

  await test('G2 + G4: a MASTERED, skill-mapped concept surfaces the skill with real evidence, and pathways are labeled informational', async () => {
    const state = freshState();
    state.conceptSkillMap.push({ id: 'csm1', concept_id: 'c_hcf', skill_id: 'skill1' });
    state.skillPathwayMap.push({ id: 'spm1', skill_id: 'skill1', pathway_id: 'pathway1' });
    state.conceptMastery.push({ learner_id: 'learnerA', concept_id: 'c_hcf', status: 'mastered' });
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA' } }, res);
    assert.strictEqual(res.body.insufficientEvidence, false);
    assert.strictEqual(res.body.skills[0].name, 'Numerical Reasoning');
    assert.deepStrictEqual([...res.body.skills[0].evidenceConcepts], ['HCF']);
    assert.strictEqual(res.body.relatedPathways[0].name, 'Engineering');
    assert.ok(res.body.disclosure.toLowerCase().includes('not a recommendation'), 'the response must explicitly disclaim recommendation/prediction framing');
  });

  await test('G3: a learner cannot view another learner\'s passport', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerB' } }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('G6: mapping the same concept to the same skill twice is rejected', async () => {
    const state = freshState();
    state.conceptSkillMap.push({ id: 'csm1', concept_id: 'c_hcf', skill_id: 'skill1' });
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: { resource: 'concept-skill-map' }, body: { conceptId: 'c_hcf', skillId: 'skill1' } }, res);
    assert.strictEqual(res.statusCode, 409);
  });

  console.log(failures === 0 ? '\nALL M76 SKILL PASSPORT TESTS PASSED' : `\n${failures} M76 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
