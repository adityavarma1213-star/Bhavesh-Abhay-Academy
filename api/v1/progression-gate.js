import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess, hasRole } from '../_lib/auth.js';
import { json, id, writeAudit, clientIp } from '../_lib/security.js';
import { verifyPassword } from '../_lib/security.js';
export const config={runtime:'nodejs'};

const clean=(v,max)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';

async function progressionOrder(subject, chapter){
  const rows=await sql`SELECT subject,chapter,MIN(created_at) AS first_seen FROM assessments WHERE subject IS NOT NULL AND chapter IS NOT NULL GROUP BY subject,chapter ORDER BY first_seen ASC,subject ASC,chapter ASC`;
  const list=rows.rows.map(r=>({subject:r.subject,chapter:r.chapter}));
  const index=list.findIndex(x=>x.subject===subject&&x.chapter===chapter);
  return {list,index,previous:index>0?list[index-1]:null};
}

async function gateSnapshot(learnerId, subject, chapter){
  const [gate, findings, latest, bypass] = await Promise.all([
    sql`SELECT * FROM learning_progression_gates WHERE learner_id=${learnerId} AND subject=${subject} AND chapter=${chapter} LIMIT 1`,
    sql`SELECT * FROM learning_gate_findings WHERE learner_id=${learnerId} AND subject=${subject} AND chapter=${chapter} ORDER BY last_seen_at DESC`,
    sql`SELECT aa.id,aa.assessment_id,aa.end_time FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id WHERE aa.learner_id=${learnerId} AND a.subject=${subject} AND a.chapter=${chapter} AND aa.status='submitted' ORDER BY aa.end_time DESC NULLS LAST LIMIT 1`,
    sql`SELECT * FROM learning_gate_bypasses WHERE learner_id=${learnerId} AND subject=${subject} AND chapter=${chapter} ORDER BY created_at DESC LIMIT 1`,
  ]);
  const red=findings.rows.filter(f=>f.status==='red');
  const green=findings.rows.filter(f=>f.status==='green');
  const latestAttemptAt=latest.rows[0]?.end_time ? new Date(latest.rows[0].end_time).getTime() : 0;
  const latestBypass=bypass.rows[0]||null;
  const bypassActive=!!latestBypass && new Date(latestBypass.created_at).getTime()>latestAttemptAt;
  return {
    subject,chapter,
    status: bypassActive ? 'bypassed' : red.length ? 'locked' : findings.rows.length ? 'cleared' : 'open',
    redCount:red.length,greenCount:green.length,totalFindings:findings.rows.length,
    findings:findings.rows.map(f=>({id:f.id,type:f.finding_type,text:f.finding_text,status:f.status,questionId:f.question_id,lastSeenAt:f.last_seen_at,clearedAt:f.cleared_at})),
    bypassActive,
    bypassReason: latestBypass?.reason || null,
    lastAssessmentId:latest.rows[0]?.assessment_id||null,
    lastAttemptId:latest.rows[0]?.id||null,
  };
}

export default async function handler(req,res){
  try{
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    const subject=clean(req.query?.subject || req.body?.subject,80);
    const chapter=clean(req.query?.chapter || req.body?.chapter,120);
    if(!learnerId||!subject||!chapter) return json(res,400,{error:{code:'INVALID_GATE_SCOPE',message:'learnerId, subject and chapter are required.'}});
    await requireLearnerAccess(session,learnerId);

    if(req.method==='GET'){
      const order=await progressionOrder(subject,chapter);
      const current=await gateSnapshot(learnerId,subject,chapter);
      let previous=null;
      if(order.previous) previous=await gateSnapshot(learnerId,order.previous.subject,order.previous.chapter);
      const canEnter=!previous || previous.status==='cleared' || previous.status==='bypassed';
      return json(res,200,{ok:true,gate:current,previous,canEnter,progression:order.list});
    }

    if(req.method==='POST'){
      if(!hasRole(session,'parent')) return json(res,403,{error:{code:'PARENT_REQUIRED',message:'Only an authenticated parent can bypass a learning gate.'}});
      const password=String(req.body?.password||'');
      const reason=clean(req.body?.reason,500);
      if(password.length<1) return json(res,400,{error:{code:'PASSWORD_REQUIRED',message:'Parent password is required.'}});
      if(reason.length<10) return json(res,400,{error:{code:'REASON_REQUIRED',message:'Please provide a reason of at least 10 characters.'}});
      const rel=await sql`SELECT 1 FROM parent_learner WHERE parent_user_id=${session.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;
      if(!rel.rows.length) return json(res,403,{error:{code:'PARENT_LEARNER_FORBIDDEN',message:'This parent account is not linked to the selected learner.'}});
      const cred=await sql`SELECT password_hash FROM credentials WHERE user_id=${session.user_id} LIMIT 1`;
      if(!cred.rows.length || !verifyPassword(password,cred.rows[0].password_hash)) return json(res,401,{error:{code:'INVALID_PARENT_PASSWORD',message:'Parent password could not be verified.'}});
      const bypassId=id('gate_bypass');
      await sql`INSERT INTO learning_gate_bypasses(id,learner_id,parent_user_id,subject,chapter,reason,created_at,ip_address) VALUES(${bypassId},${learnerId},${session.user_id},${subject},${chapter},${reason},NOW(),${clientIp(req)})`;
      await writeAudit({actorUserId:session.user_id,action:'learning_gate.bypass',entityType:'learner',entityId:learnerId,metadata:{subject,chapter,reason,bypassId}});
      const gate=await gateSnapshot(learnerId,subject,chapter);
      return json(res,200,{ok:true,gate,message:'Parent-authorized bypass recorded. The next completed assessment in this chapter will re-evaluate the gate.'});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'PROGRESSION_GATE_FAILED',message:e.status?e.message:'Unable to process learning progression gate.'}});}
}
