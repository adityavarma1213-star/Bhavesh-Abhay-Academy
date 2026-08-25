import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const TRACKS = {
  'Space & Aerospace': ['algebra','geometry','physics','problem-solving','coding'],
  'Software Development': ['algebra','coding','logic','problem-solving','computer-science'],
  'STEM Research': ['mathematics','science','research','problem-solving','communication'],
  'Data & AI': ['algebra','statistics','coding','logic','data-analysis'],
};
const clean = (v,max=160) => String(v ?? '').trim().slice(0,max);
const normalize = v => clean(v).toLowerCase().replace(/[_\s]+/g,'-');
const label = r => r.title ? clean(r.title,120) : r.concept ? clean(r.concept,120) : 'Academic evidence';

export default async function handler(req,res){
  if(req.method !== 'GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try {
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    await requireLearnerAccess(session,learnerId);
    const track=clean(req.query?.track,80);
    if(!TRACKS[track]) return json(res,400,{error:{code:'INVALID_TRACK',message:'A supported career track is required.'}});
    const rows=await sql`SELECT id,concept,correctness,title,attempt_id,created_at FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at DESC LIMIT 500`;
    const skills=TRACKS[track].map(skill=>{
      const target=normalize(skill);
      const evidence=rows.rows.filter(r=>{const concept=normalize(r.concept);return concept&&(concept===target||concept.includes(target)||target.includes(concept)||concept.split('-')[0]===target.split('-')[0]);});
      const strengths=evidence.filter(r=>r.correctness==='correct');
      const support=evidence.filter(r=>['incorrect','partially_correct','uncertain'].includes(r.correctness));
      const status=strengths.length?'strength_evidence':support.length?'support_needed':'not_yet_tracked';
      const confidence=status==='not_yet_tracked'?{level:'insufficient',score:null}:evidence.length>=3?{level:'high',score:Math.min(.95,.7+evidence.length*.05)}:evidence.length===2?{level:'moderate',score:.65}:{level:'early',score:.4};
      return {skill,status,evidenceCount:evidence.length,evidenceIds:[...new Set(evidence.map(r=>String(r.id||r.attempt_id||r.concept||'').trim()).filter(Boolean))].slice(0,8),evidenceSources:[...new Set(evidence.map(label))].slice(0,5),confidence,decisionBasis:status==='not_yet_tracked'?'No conclusion: tagged evidence is missing.':`Based on ${evidence.length} tagged academic evidence item${evidence.length===1?'':'s'}.`};
    });
    const tracked=skills.filter(x=>x.status!=='not_yet_tracked');
    const strengths=skills.filter(x=>x.status==='strength_evidence');
    const summary=!tracked.length?'Not enough evidence':strengths.length===skills.length?'Strong current alignment':strengths.length>=Math.ceil(skills.length*.6)?'Promising current alignment':'Mixed alignment — explore further';
    return json(res,200,{ok:true,learnerId,track,summary,coverage:skills.length?tracked.length/skills.length:0,skills,methodology:'Career alignment compares selected track skills only with tagged academic evidence already stored for the learner. Missing evidence is not treated as weakness.',limitations:['Exploratory guidance only; not a prediction or guarantee.','No job, salary, admission, or future outcome is inferred.','Consequential decisions should be reviewed with a parent, teacher, or qualified career professional.']});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'CAREER_ANALYTICS_FAILED',message:e.status?e.message:'Unable to load career evidence.'}});}
}
