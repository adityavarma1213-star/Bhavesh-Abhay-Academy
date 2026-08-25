import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const STATES=new Set(['struggling','needs_revision','learning','mastered','strong','unknown']);

function chooseAction(state){
  if(['struggling','needs_revision'].includes(state)) return 'guided_reteach';
  if(state==='learning') return 'retrieval_practice';
  if(['mastered','strong'].includes(state)) return 'extension';
  return 'evidence_building';
}

export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    await requireLearnerAccess(session,learnerId);
    const subject=clean(req.query?.subject,120);
    const chapter=clean(req.query?.chapter,160);
    const rows=await sql`
      SELECT subject,chapter,correctness,COUNT(*)::int AS evidence_count,
             COUNT(DISTINCT question_id)::int AS question_count,
             MAX(created_at) AS last_seen
      FROM learning_evidence
      WHERE learner_id=${learnerId}
        AND (${subject}='' OR subject=${subject})
        AND (${chapter}='' OR chapter=${chapter})
      GROUP BY subject,chapter,correctness
      ORDER BY MAX(created_at) DESC`;

    const grouped={};
    for(const r of rows.rows){
      const key=`${r.subject||'Unknown'}::${r.chapter||'Unspecified'}`;
      if(!grouped[key]) grouped[key]={subject:r.subject||null,chapter:r.chapter||null,total:0,correct:0,incorrect:0,partial:0,questions:0,lastSeen:null};
      const g=grouped[key]; const n=Number(r.evidence_count||0); g.total+=n; g.questions+=Number(r.question_count||0);
      if(r.correctness==='correct') g.correct+=n;
      else if(r.correctness==='partially_correct') g.partial+=n;
      else g.incorrect+=n;
      if(!g.lastSeen||new Date(r.last_seen)>new Date(g.lastSeen)) g.lastSeen=r.last_seen;
    }
    const concepts=Object.values(grouped).map(g=>{
      const accuracy=g.total?g.correct/g.total:0;
      const state=g.total<2?'unknown':accuracy>=0.85?'strong':accuracy>=0.65?'learning':accuracy>=0.4?'needs_revision':'struggling';
      const action=chooseAction(state);
      return {...g,accuracy:Math.round(accuracy*1000)/10,state,action,evidenceSufficient:g.total>=1,reason:state==='unknown'?'Collect tagged evidence before adapting instruction.':action==='guided_reteach'?'Recent evidence indicates substantial difficulty; re-teach with a worked example before another independent attempt.':action==='retrieval_practice'?'Evidence indicates active learning; use short retrieval practice and treat the result as new evidence.':'Current evidence supports extension or continued development without claiming permanent mastery.'};
    });
    return json(res,200,{ok:true,learnerId,filters:{subject:subject||null,chapter:chapter||null},concepts,policy:{productiveStruggle:true,showWorkedExampleAfterAttempt:true,spacedReview:true,masteryRequiresEvidence:true,avoidShameLanguage:true},limitations:['Pedagogy recommendations are evidence-based instructional guidance, not diagnosis.','Teacher judgment remains authoritative for consequential instructional decisions.']});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'PEDAGOGY_FAILED',message:e.status?e.message:'Unable to load pedagogy guidance.'}});}
}
