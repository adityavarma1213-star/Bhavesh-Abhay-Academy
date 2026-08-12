import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { json } from '../_lib/security.js';
export const config={runtime:'nodejs'};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function forecastFor({score, evidence, daysUntil}){
  const evidenceCount=evidence.length;
  if(evidenceCount<3 || score==null) return {status:'insufficient_evidence',message:'BAA needs at least 3 relevant evidence points before making a chapter forecast.'};
  const recent=evidence.slice(-10);
  const correct=recent.filter(x=>x.correctness==='correct').length/recent.length*100;
  const base=Number(score);
  const predicted=Math.round(clamp(base*0.45+correct*0.55,0,100));
  const low=Math.max(0,predicted-6), high=Math.min(100,predicted+6);
  let level=predicted<60?'urgent':predicted<75?'caution':'monitor';
  // exam-close-caution intentionally wins over the 60–74% caution band when both apply.
  if(daysUntil!=null && daysUntil<=14 && predicted<75) level=predicted<60?'urgent':'exam_close_caution';
  return {status:'forecast',predictedPercentage:predicted,range:{low,high},warningLevel:level,evidenceCount,daysUntil};
}
export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const s=await requireAuth(req); const learnerId=String(req.query?.learnerId||''); await requireLearnerAccess(s,learnerId);
    const [upcoming,attempts,evidence]=await Promise.all([
      sql`SELECT p.id,p.title,p.subject,p.date,p.assessment_id,a.chapter FROM planner_upcoming_assessments p LEFT JOIN assessments a ON a.id=p.assessment_id WHERE p.learner_id=${learnerId} AND p.date>=CURRENT_DATE ORDER BY p.date ASC LIMIT 12`,
      sql`SELECT aa.id,aa.assessment_id,aa.score,aa.max_score,aa.end_time,a.subject,a.chapter FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id WHERE aa.learner_id=${learnerId} AND aa.status='submitted' AND aa.score IS NOT NULL AND aa.max_score>0 ORDER BY aa.end_time DESC LIMIT 12`,
      sql`SELECT subject,chapter,correctness,created_at FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at DESC LIMIT 200`,
    ]);
    const all=attempts.rows.map(a=>Number(a.score)/Number(a.max_score)*100);
    const overall=all.length?all.reduce((x,y)=>x+y,0)/all.length:null;
    const exams=upcoming.rows.map(u=>{
      const rel=evidence.rows.filter(e=>(u.subject?e.subject===u.subject:true)&&(u.chapter?e.chapter===u.chapter:true));
      const relAttempts=attempts.rows.filter(a=>(u.subject?a.subject===u.subject:true)&&(u.chapter?a.chapter===u.chapter:true));
      // Forecasts are scoped to the exact upcoming assessment's subject/chapter.
      // Do not borrow an unrelated subject's score when this chapter has no completed attempt.
      const chapterScore=relAttempts.length?Number(relAttempts[0].score)/Number(relAttempts[0].max_score)*100:null;
      const days=Math.ceil((new Date(`${u.date}T00:00:00Z`).getTime()-Date.now())/86400000);
      return {...u,daysUntil:days,forecast:forecastFor({score:chapterScore,evidence:rel,daysUntil:days})};
    });
    const warnings=exams.filter(e=>['urgent','exam_close_caution','caution'].includes(e.forecast.warningLevel));
    return json(res,200,{ok:true,overallPercentage:overall==null?null:Math.round(overall*10)/10,exams,warnings});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'ACADEMIC_FORECAST_FAILED',message:e.status?e.message:'Unable to generate academic forecast.'}});}
}
