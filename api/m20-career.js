import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };
const MIN_EVIDENCE = 3;
const TRACKS = {
  'Space & Aerospace': ['algebra','geometry','physics','problem-solving','coding'],
  'Software Development': ['algebra','coding','logic','problem-solving','computer-science'],
  'STEM Research': ['mathematics','science','research','problem-solving','communication'],
  'Data & AI': ['algebra','statistics','coding','logic','data-analysis'],
};
const clean = (v,max=160) => String(v ?? '').trim().slice(0,max);
const normalize = v => clean(v).toLowerCase().replace(/[_\s]+/g,'-');
const humanize = v => clean(v,80).replace(/-/g,' ');
const label = r => r.title ? clean(r.title,120) : r.concept ? clean(r.concept,120) : 'Academic evidence';

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method !== 'GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET',...NO_STORE});
  try {
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    await requireLearnerAccess(session,learnerId);
    const track=clean(req.query?.track,80);
    if(!TRACKS[track]) return json(res,400,{error:{code:'INVALID_TRACK',message:'A supported career track is required.'}},NO_STORE);
    const rows=await sql`SELECT id,concept,correctness,title,attempt_id,created_at FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at DESC LIMIT 500`;
    const skills=TRACKS[track].map(skill=>{
      const target=normalize(skill);
      const evidence=rows.rows.filter(r=>{const concept=normalize(r.concept);return concept&&(concept===target||concept.includes(target)||target.includes(concept)||concept.split('-')[0]===target.split('-')[0]);});
      const strengths=evidence.filter(r=>r.correctness==='correct');
      const support=evidence.filter(r=>['incorrect','partially_correct','uncertain'].includes(r.correctness));
      const evidenceSufficient=evidence.length>=MIN_EVIDENCE;
      const status=!evidenceSufficient?'not_yet_tracked':strengths.length>=(evidence.length*.8)?'strength_evidence':support.length?'support_needed':'learning_evidence';
      const confidence=status==='not_yet_tracked'?{level:'insufficient',score:null,label:'Insufficient evidence'}:evidence.length>=6?{level:'high',score:Math.min(.95,.7+evidence.length*.04),label:'Strong evidence base'}:{level:'moderate',score:Math.min(.75,.55+evidence.length*.04),label:'Evidence-backed signal'};
      const explanation=status==='strength_evidence'?`Academic evidence currently supports ${humanize(skill)} as a relative strength.`:status==='support_needed'?`Academic evidence shows ${humanize(skill)} needs additional practice or review.`:status==='learning_evidence'?`BAA has enough tagged academic evidence to track ${humanize(skill)}, but it does not yet support a strong or support-needed conclusion.`:`BAA does not yet have enough tagged academic evidence to assess ${humanize(skill)}.`;
      const nextAction=status==='strength_evidence'?`Continue developing ${humanize(skill)}.`:status==='support_needed'?`Practice or review ${humanize(skill)} and collect fresh evidence.`:`Collect tagged academic evidence for ${humanize(skill)} before drawing a conclusion.`;
      return {skill,status,evidenceCount:evidence.length,evidenceIds:[...new Set(evidence.map(r=>String(r.id||r.attempt_id||r.concept||'').trim()).filter(Boolean))].slice(0,8),evidenceSources:[...new Set(evidence.map(label))].slice(0,5),confidence,explanation,decisionBasis:status==='not_yet_tracked'?'No conclusion: fewer than three tagged evidence items.':`Based on ${evidence.length} tagged academic evidence item${evidence.length===1?'':'s'}.`,nextAction};
    });
    const tracked=skills.filter(x=>x.status!=='not_yet_tracked');
    const strengths=skills.filter(x=>x.status==='strength_evidence');
    const summary=!tracked.length?'Not enough evidence':strengths.length===skills.length?'Strong current alignment':strengths.length>=Math.ceil(skills.length*.6)?'Promising current alignment':'Mixed alignment — explore further';
    return json(res,200,{ok:true,learnerId,track,summary,coverage:skills.length?tracked.length/skills.length:0,skills,evidenceGate:{minEvidence:MIN_EVIDENCE,sparseSkillsExcluded:skills.filter(x=>x.status==='not_yet_tracked').length},methodology:'Career alignment compares selected track skills only with tagged academic evidence already stored for the learner. A skill must have at least three tagged evidence items before BAA assigns an evidence-backed status; missing evidence is not treated as weakness.',limitations:['Exploratory guidance only; not a prediction or guarantee.','No job, salary, admission, or future outcome is inferred.','Consequential decisions should be reviewed with a parent, teacher, or qualified career professional.'],disclaimer:'Career alignment is exploratory guidance, not a prediction or guarantee.'},NO_STORE);
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'CAREER_ANALYTICS_FAILED',message:e.status?e.message:'Unable to load career evidence.'}},NO_STORE);}
}
