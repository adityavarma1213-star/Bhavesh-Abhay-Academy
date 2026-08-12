import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess, hasRole } from '../_lib/auth.js';
import { json, id, writeAudit } from '../_lib/security.js';
export const config={runtime:'nodejs'};

export default async function handler(req,res){
  try{
    const session=await requireAuth(req);
    if(!hasRole(session,'teacher') && !hasRole(session,'admin')) return json(res,403,{error:{code:'TEACHER_ROLE_REQUIRED',message:'Teacher access required.'}});
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    if(req.method==='GET'){
      const r=await sql`SELECT id,learner_id,text,created_at,author_user_id FROM teacher_notes WHERE learner_id=${learnerId} ORDER BY created_at DESC`;
      return json(res,200,{ok:true,notes:r.rows});
    }
    if(req.method!=='POST' && req.method!=='DELETE') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST or DELETE required.'}});
    if(req.method==='POST'){
      const text=String(req.body?.text||'').trim().slice(0,500);
      if(!text) return json(res,400,{error:{code:'NOTE_TEXT_REQUIRED',message:'Note text is required.'}});
      const noteId=id('note');
      await sql`INSERT INTO teacher_notes(id,learner_id,author_user_id,text,created_at) VALUES(${noteId},${learnerId},${session.user_id},${text},NOW())`;
      await writeAudit({actorUserId:session.user_id,action:'teacher_note.create',entityType:'learner',entityId:learnerId,metadata:{noteId}});
      return json(res,201,{ok:true,note:{id:noteId,learner_id:learnerId,text,author_user_id:session.user_id}});
    }
    const noteId=String(req.query?.noteId||'');
    if(!noteId) return json(res,400,{error:{code:'NOTE_ID_REQUIRED',message:'Note ID is required.'}});
    const owned=await sql`SELECT id FROM teacher_notes WHERE id=${noteId} AND learner_id=${learnerId} AND author_user_id=${session.user_id} LIMIT 1`;
    if(!owned.rows.length) return json(res,404,{error:{code:'NOTE_NOT_FOUND',message:'Note not found or not owned by this teacher.'}});
    await sql`DELETE FROM teacher_notes WHERE id=${noteId} AND learner_id=${learnerId} AND author_user_id=${session.user_id}`;
    await writeAudit({actorUserId:session.user_id,action:'teacher_note.delete',entityType:'learner',entityId:learnerId,metadata:{noteId}});
    return json(res,200,{ok:true});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'TEACHER_NOTES_FAILED',message:e.status?e.message:'Unable to manage teacher notes.'}});}
}
