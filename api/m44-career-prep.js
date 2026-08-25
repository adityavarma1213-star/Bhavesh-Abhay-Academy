import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const clean = (v,max=240) => String(v ?? '').trim().slice(0,max);
const strings = (v,max=120) => [...new Set((Array.isArray(v)?v:[]).filter(x=>typeof x==='string').map(x=>clean(x,max)).filter(Boolean))].slice(0,40);
function normalize(input){
  const x=input&&typeof input==='object'?input:{};
  const projects=Array.isArray(x.projects)?x.projects.filter(p=>p&&typeof p==='object').slice(0,40).map(p=>({title:clean(p.title,160),description:clean(p.description,500),skills:strings(p.skills),evidenceIds:strings(p.evidenceIds)})):[];
  return {goal:clean(x.goal),skills:strings(x.skills),projects};
}
export default async function handler(req,res){
  try{
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    await requireLearnerAccess(session,learnerId);
    if(req.method==='GET'){
      const r=await sql`SELECT learner_id AS "learnerId",goal,skills,projects,created_at AS "createdAt",updated_at AS "updatedAt" FROM career_prep_profiles WHERE learner_id=${learnerId} LIMIT 1`;
      return json(res,200,{ok:true,profile:r.rows[0]||{learnerId,goal:'',skills:[],projects:[]}});
    }
    if(req.method==='PUT'){
      const profile=normalize(req.body||{});
      await sql`INSERT INTO career_prep_profiles(learner_id,goal,skills,projects,updated_at) VALUES(${learnerId},${profile.goal},${JSON.stringify(profile.skills)}::jsonb,${JSON.stringify(profile.projects)}::jsonb,NOW()) ON CONFLICT(learner_id) DO UPDATE SET goal=EXCLUDED.goal,skills=EXCLUDED.skills,projects=EXCLUDED.projects,updated_at=NOW()`;
      await writeAudit({actorUserId:session.user_id,action:'CAREER_PREP_PROFILE_UPSERT',entityType:'learner',entityId:learnerId,metadata:{projectCount:profile.projects.length,skillCount:profile.skills.length}});
      return json(res,200,{ok:true,learnerId,profile});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'CAREER_PREP_FAILED',message:e.status?e.message:'Unable to load or save career preparation profile.'}});}
}
