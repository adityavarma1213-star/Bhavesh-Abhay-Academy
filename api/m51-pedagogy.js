import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const MIN_EVIDENCE = 3;
const MAX_LEARNER_ID_CHARS = 100;
const MAX_SUBJECT_CHARS = 120;
const MAX_CHAPTER_CHARS = 160;
const VALID_CORRECTNESS = new Set(['correct','partially_correct','incorrect']);
// Curriculum fields are grouping identities. Never silently truncate them;
// response/display bounding must happen only after analytical grouping.
const clean=(v)=>String(v??'').trim();
const display=(v,max=180)=>clean(v).slice(0,max);

function requireBounded(value, max, code, message, { required = false } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized && required) {
    const error = new Error(message);
    error.status = 400;
    error.code = code;
    throw error;
  }
  if (normalized.length > max) {
    const error = new Error(message);
    error.status = 400;
    error.code = code;
    throw error;
  }
  return normalized;
}

function chooseAction(state){
  if(['struggling','needs_revision'].includes(state)) return 'guided_reteach';
  if(state==='learning') return 'retrieval_practice';
  if(['mastered','strong'].includes(state)) return 'extension';
  return 'evidence_building';
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const session=await requireAuth(req);
    const learnerId=requireBounded(req.query?.learnerId,MAX_LEARNER_ID_CHARS,'LEARNER_ID_TOO_LONG','Learner identifier exceeds the allowed length.',{required:true});
    await requireLearnerAccess(session,learnerId);
    const subject=requireBounded(req.query?.subject,MAX_SUBJECT_CHARS,'SUBJECT_TOO_LONG','Subject filter exceeds the allowed length.');
    const chapter=requireBounded(req.query?.chapter,MAX_CHAPTER_CHARS,'CHAPTER_TOO_LONG','Chapter filter exceeds the allowed length.');
    const rows=await sql`
      SELECT subject,chapter,correctness,COUNT(*)::int AS evidence_count,
             COUNT(DISTINCT question_id)::int AS question_count,
             MAX(created_at) AS last_seen
      FROM learning_evidence
      WHERE learner_id=${learnerId}
        AND (${subject}='' OR subject=${subject})
        AND (${chapter}='' OR chapter=${chapter})
        AND correctness IN ('correct','partially_correct','incorrect')
      GROUP BY subject,chapter,correctness
      ORDER BY MAX(created_at) DESC`;

    const grouped={};
    for(const r of rows.rows){
      const key=`${r.subject||'Unknown'}::${r.chapter||'Unspecified'}`;
      if(!grouped[key]) grouped[key]={subject:r.subject||null,chapter:r.chapter||null,total:0,correct:0,incorrect:0,partial:0,questions:0,lastSeen:null};
      const g=grouped[key]; const n=Number(r.evidence_count||0); g.total+=n; g.questions+=Number(r.question_count||0);
      if(r.correctness==='correct') g.correct+=n;
      else if(r.correctness==='partially_correct') g.partial+=n;
      else if(r.correctness==='incorrect') g.incorrect+=n;
      if(!g.lastSeen||new Date(r.last_seen)>new Date(g.lastSeen)) g.lastSeen=r.last_seen;
    }
    const concepts=Object.values(grouped).map(g=>{
      const accuracy=g.total?g.correct/g.total:0;
      const evidenceSufficient=g.total>=MIN_EVIDENCE;
      const state=!evidenceSufficient?'unknown':accuracy>=0.85?'strong':accuracy>=0.65?'learning':accuracy>=0.4?'needs_revision':'struggling';
      const action=chooseAction(state);
      return {...g,subject:display(g.subject,MAX_SUBJECT_CHARS),chapter:display(g.chapter,MAX_CHAPTER_CHARS),accuracy:evidenceSufficient?Math.round(accuracy*1000)/10:null,state,action,evidenceSufficient,reason:!evidenceSufficient?`Collect at least ${MIN_EVIDENCE} tagged evidence points before adapting instruction.`:action==='guided_reteach'?'Recent evidence indicates substantial difficulty; re-teach with a worked example before another independent attempt.':action==='retrieval_practice'?'Evidence indicates active learning; use short retrieval practice and treat the result as new evidence.':'Current evidence supports extension or continued development without claiming permanent mastery.'};
    });
    return json(res,200,{ok:true,learnerId,filters:{subject:subject||null,chapter:chapter||null},concepts,evidenceGate:{minEvidence:MIN_EVIDENCE,sparseConceptsAreNotCharacterized:true},policy:{productiveStruggle:true,showWorkedExampleAfterAttempt:true,spacedReview:true,masteryRequiresEvidence:true,avoidShameLanguage:true},limitations:['Pedagogy recommendations are evidence-based instructional guidance, not diagnosis.','Teacher judgment remains authoritative for consequential instructional decisions.']});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'PEDAGOGY_FAILED',message:e.status?e.message:'Unable to load pedagogy guidance.'}});}
}
