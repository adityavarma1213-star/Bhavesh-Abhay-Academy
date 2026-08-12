import { sql } from '../_lib/db.js';
import { requireAuth, hasRole } from '../_lib/auth.js';
import { json, id, writeAudit } from '../_lib/security.js';
export const config={runtime:'nodejs'};

async function teacherOwnsClass(userId,classId){
  const r=await sql`SELECT id,name,subject,teacher_user_id FROM classes WHERE id=${classId} AND teacher_user_id=${userId} AND archived_at IS NULL LIMIT 1`;
  return r.rows[0]||null;
}
async function classSnapshot(userId,classId){
  const cls=await teacherOwnsClass(userId,classId); if(!cls){const e=new Error('Class not found or not owned by this teacher.');e.status=404;throw e;}
  const members=await sql`SELECT l.id,l.display_name FROM class_members cm JOIN learners l ON l.id=cm.learner_id WHERE cm.class_id=${classId} AND cm.status='active' AND l.deactivated_at IS NULL ORDER BY l.display_name`;
  const memberIds=members.rows.map(x=>x.id);
  if(!memberIds.length) return {class:cls,members:[],concepts:[],summary:{learners:0,evidence:0,accuracy:null}};
  const evidence=await sql`SELECT subject,chapter,topic,concept,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE correctness='correct')::int AS correct,COUNT(DISTINCT learner_id)::int AS learners
    FROM learning_evidence WHERE learner_id=ANY(${memberIds}) GROUP BY subject,chapter,topic,concept ORDER BY subject,chapter,topic,concept`;
  const summary=await sql`SELECT COUNT(DISTINCT learner_id)::int AS learners,COUNT(*)::int AS evidence,ROUND(100.0*SUM(CASE WHEN correctness='correct' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),1) AS accuracy FROM learning_evidence WHERE learner_id=ANY(${memberIds})`;
  return {class:cls,members:members.rows,concepts:evidence.rows.map(r=>({...r,accuracy:r.total?Math.round(Number(r.correct)*1000/Number(r.total))/10:null})),summary:summary.rows[0]||{}};
}
export default async function handler(req,res){
  try{
    const s=await requireAuth(req); if(!hasRole(s,'teacher')&&!hasRole(s,'admin')) return json(res,403,{error:{code:'TEACHER_ROLE_REQUIRED',message:'Teacher access required.'}});
    if(req.method==='GET'){
      const classId=String(req.query?.classId||'');
      if(!classId){const r=await sql`SELECT id,name,subject,created_at,updated_at FROM classes WHERE teacher_user_id=${s.user_id} AND archived_at IS NULL ORDER BY created_at DESC`;return json(res,200,{ok:true,classes:r.rows});}
      return json(res,200,{ok:true,snapshot:await classSnapshot(s.user_id,classId)});
    }
    if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});
    const action=String(req.body?.action||'create_class');
    if(action==='create_class'){
      const name=String(req.body?.name||'').trim().slice(0,120); const subject=String(req.body?.subject||'').trim().slice(0,120)||null;
      if(!name)return json(res,400,{error:{code:'CLASS_NAME_REQUIRED',message:'Class name is required.'}});
      const classId=id('class'); await sql`INSERT INTO classes(id,teacher_user_id,name,subject,created_at,updated_at) VALUES(${classId},${s.user_id},${name},${subject},NOW(),NOW())`;
      const learnerIds=Array.isArray(req.body?.learnerIds)?req.body.learnerIds.map(String).slice(0,100):[];
      for(const learnerId of learnerIds){const ok=await sql`SELECT 1 FROM teacher_learner WHERE teacher_user_id=${s.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;if(ok.rows.length)await sql`INSERT INTO class_members(id,class_id,learner_id,status,joined_at) VALUES(${id('cm')},${classId},${learnerId},'active',NOW()) ON CONFLICT(class_id,learner_id) DO UPDATE SET status='active',removed_at=NULL`}
      await writeAudit({actorUserId:s.user_id,action:'class.create',entityType:'class',entityId:classId,metadata:{learnerCount:learnerIds.length}});
      return json(res,201,{ok:true,class:{id:classId,name,subject}});
    }
    if(action==='add_member'){
      const classId=String(req.body?.classId||''),learnerId=String(req.body?.learnerId||''); if(!classId||!learnerId)return json(res,400,{error:{code:'CLASS_MEMBER_FIELDS_REQUIRED',message:'classId and learnerId are required.'}});
      if(!(await teacherOwnsClass(s.user_id,classId)))return json(res,404,{error:{code:'CLASS_NOT_FOUND',message:'Class not found.'}});
      const ok=await sql`SELECT 1 FROM teacher_learner WHERE teacher_user_id=${s.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;if(!ok.rows.length)return json(res,403,{error:{code:'LEARNER_NOT_ASSIGNED',message:'Assign the learner to this teacher before adding them to a class.'}});
      await sql`INSERT INTO class_members(id,class_id,learner_id,status,joined_at) VALUES(${id('cm')},${classId},${learnerId},'active',NOW()) ON CONFLICT(class_id,learner_id) DO UPDATE SET status='active',removed_at=NULL`;
      return json(res,200,{ok:true});
    }
    return json(res,400,{error:{code:'UNKNOWN_CLASS_ACTION',message:'Unsupported class action.'}});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'CLASS_ANALYTICS_FAILED',message:e.status?e.message:'Unable to load class analytics.'}});}
}
