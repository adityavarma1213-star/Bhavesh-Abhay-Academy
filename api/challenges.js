import { sql } from './_lib/db.js';
import { requireAuth, canAccessLearner } from './_lib/auth.js';
import { json, id, writeAudit } from './_lib/security.js';
export const config={runtime:'nodejs'};
const MODES=new Set(['xp_race','quiz_battle','streak_battle','weekly_xp','team_battle']);
export default async function handler(req,res){
 try{
  const s=await requireAuth(req);
  const me=await sql`SELECT id,display_name FROM learners WHERE user_id=${s.user_id} AND deactivated_at IS NULL LIMIT 1`;
  if(!me.rows.length)return json(res,404,{error:{code:'LEARNER_NOT_FOUND',message:'Student learner profile not found.'}});
  const learnerId=me.rows[0].id;
  if(req.method==='GET'){
   const r=await sql`SELECT c.id,c.mode,c.status,c.target_xp,c.created_at,c.accepted_at,c.completed_at,
     a.id AS challenger_id,a.display_name AS challenger_name,b.id AS challenged_id,b.display_name AS challenged_name
     FROM challenge_matches c JOIN learners a ON a.id=c.challenger_learner_id JOIN learners b ON b.id=c.challenged_learner_id
     WHERE c.challenger_learner_id=${learnerId} OR c.challenged_learner_id=${learnerId}
     ORDER BY c.created_at DESC LIMIT 50`;
   return json(res,200,{ok:true,challenges:r.rows});
  }
  if(req.method!=='POST')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});
  const body=req.body||{}; const action=String(body.action||'create');
  if(action==='create'){
   const opponent=String(body.challengedLearnerId||'');const mode=String(body.mode||'quiz_battle');
   if(!opponent||opponent===learnerId||!MODES.has(mode))return json(res,400,{error:{code:'INVALID_CHALLENGE',message:'Opponent and supported mode are required.'}});
   if(!(await canAccessLearner(s,learnerId)))return json(res,403,{error:{code:'FORBIDDEN',message:'Challenge access denied.'}});
   const target=Number(body.targetXp||500);if(target<0||target>100000)return json(res,400,{error:{code:'INVALID_TARGET',message:'Target XP is invalid.'}});
   const exists=await sql`SELECT id FROM learners WHERE id=${opponent} AND deactivated_at IS NULL LIMIT 1`;if(!exists.rows.length)return json(res,404,{error:{code:'OPPONENT_NOT_FOUND',message:'Student not found.'}});
   const cid=id('challenge');await sql`INSERT INTO challenge_matches(id,challenger_learner_id,challenged_learner_id,mode,status,target_xp,created_at) VALUES(${cid},${learnerId},${opponent},${mode},'pending',${target},NOW())`;
   await writeAudit({actorUserId:s.user_id,action:'challenge.create',entityType:'challenge',entityId:cid,metadata:{mode,targetXp:target,opponent}});
   return json(res,201,{ok:true,challengeId:cid,status:'pending'});
  }
  if(action==='respond'){
   const cid=String(body.challengeId||''),status=String(body.status||'');if(!cid||!['accepted','declined'].includes(status))return json(res,400,{error:{code:'INVALID_RESPONSE',message:'Challenge id and accepted/declined status are required.'}});
   const r=await sql`UPDATE challenge_matches SET status=${status},accepted_at=CASE WHEN ${status}='accepted' THEN NOW() ELSE accepted_at END,updated_at=NOW() WHERE id=${cid} AND challenged_learner_id=${learnerId} AND status='pending' RETURNING id,status`;
   if(!r.rows.length)return json(res,404,{error:{code:'CHALLENGE_NOT_FOUND',message:'Pending challenge not found.'}});
   await writeAudit({actorUserId:s.user_id,action:'challenge.respond',entityType:'challenge',entityId:cid,metadata:{status}});return json(res,200,{ok:true,challenge:r.rows[0]});
  }
  return json(res,400,{error:{code:'INVALID_ACTION',message:'Unsupported challenge action.'}});
 }catch(e){return json(res,e.status||500,{error:{code:e.code||'CHALLENGE_REQUEST_FAILED',message:e.status?e.message:'Challenge request failed.'}});}
}
