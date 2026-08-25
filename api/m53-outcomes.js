import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';
export const config={runtime:'nodejs'};
const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
 try{
  const session=await requireAuth(req);const learnerId=clean(req.query?.learnerId,120);await requireLearnerAccess(session,learnerId);
  const subject=clean(req.query?.subject,120),chapter=clean(req.query?.chapter,160);
  const rows=await sql`SELECT a.subject,a.chapter,aa.id,aa.score,aa.max_score,aa.submitted_at AS "submittedAt" FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id WHERE aa.learner_id=${learnerId} AND aa.status='submitted' AND aa.max_score>0 AND (${subject}='' OR a.subject=${subject}) AND (${chapter}='' OR a.chapter=${chapter}) ORDER BY aa.submitted_at ASC`;
  const groups={};for(const r of rows.rows){const k=`${r.subject||'Unknown'}::${r.chapter||'Unspecified'}`;(groups[k]??=[]).push(r);}
  const outcomes=Object.values(groups).map(items=>{const first=items[0],last=items[items.length-1],pre=Number(first.score)*100/Number(first.max_score),post=Number(last.score)*100/Number(last.max_score);const absolute=Number((post-pre).toFixed(2));return {subject:first.subject||null,chapter:first.chapter||null,observations:items.length,prePercentage:Number(pre.toFixed(2)),postPercentage:Number(post.toFixed(2)),absoluteChange:items.length>1?absolute:0,interpretation:items.length<2?'insufficient_comparable_observations':absolute>0?'improved':absolute<0?'declined':'unchanged',firstObservedAt:first.submittedAt,lastObservedAt:last.submittedAt};});
  return json(res,200,{ok:true,learnerId,filters:{subject:subject||null,chapter:chapter||null},outcomes,limitation:'Outcome change is reported only from comparable submitted assessment observations; activity alone is not treated as learning.'});
 }catch(e){return json(res,e.status||500,{error:{code:e.code||'OUTCOMES_FAILED',message:e.status?e.message:'Unable to load learning outcomes.'}});}
}
