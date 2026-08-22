const fs=require('fs'); const path=require('path'); const root=path.join(__dirname,'..'); let failures=0;
function a(c,m){if(!c){console.error('FAIL:',m);failures++;}else console.log('PASS:',m)}
function read(f){return fs.readFileSync(path.join(root,f),'utf8')}
const migration=read('db/migrations/004_assessment_catalog_seed.sql');
a(migration.includes('INSERT INTO questions'),'C1: assessment question seed migration exists');
a(migration.includes('INSERT INTO assessments'),'C2: assessment catalog seed migration exists');
a(migration.includes('INSERT INTO assessment_questions'),'C3: assessment-question mapping seed exists');
for(const f of ['api/v1/[...route].js','api/v1/[...route].js','api/v1/[...route].js']){const s=read(f);a(s.includes('requireAuth'),'C4: '+f+' requires authentication');a(s.includes('requireLearnerAccess'),'C5: '+f+' enforces learner authorization');}
a(read('db/migrations/005_core_module_persistence.sql').includes('CREATE TABLE IF NOT EXISTS homework_submissions'),'C6: homework persistence table exists');
a(read('db/migrations/005_core_module_persistence.sql').includes('CREATE TABLE IF NOT EXISTS learner_rewards'),'C7: rewards persistence table exists');
a(read('js/baa-assessment.js').includes('/api/v1/assessment'),'C8: assessment client has server sync path');
a(read('js/baa-homework.js').includes('/api/v1/homework'),'C9: homework client has server sync path');
a(read('js/baa-rewards.js').includes('/api/v1/rewards'),'C10: rewards client has server sync path');
const hw=read('api/evaluate-homework.js');a(hw.includes('inlineData'),'C11: homework evaluator sends image as Gemini inlineData');a(hw.includes('imageDataUrl'),'C12: homework evaluator accepts transient image data');a(hw.includes("EVALUATION_TYPE = 'image_or_text'"),'C13: homework evaluator distinguishes image/text evaluation');
const ui=read('homework-scanner.html');a(ui.includes('pendingImage.dataUrl'),'C14: scanner passes transient image bytes to evaluation flow');
const stu=read('student-os.html');a(stu.includes('BAARewards.hydrateFromServer'),'C15: Student OS hydrates rewards for authenticated learner');
a(stu.includes('escapePlannerHtml(g.text)'),'C16: planner goal text is HTML-escaped');
if(failures){console.error(`${failures} completion checks failed`);process.exit(1)}console.log('ALL CORE COMPLETION CHECKS PASSED');
