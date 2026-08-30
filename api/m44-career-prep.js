import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };
const clean = (v,max=240) => String(v ?? '').trim().slice(0,max);
const strings = (v,max=120) => [...new Set((Array.isArray(v)?v:[]).filter(x=>typeof x==='string').map(x=>clean(x,max)).filter(Boolean))].slice(0,40);
function body(req){
  if(req.body&&typeof req.body==='object') return req.body;
  try{return JSON.parse(req.body||'{}');}catch{return {};}
}
function normalize(input){
  const x=input&&typeof input==='object'?input:{};
  const projects=Array.isArray(x.projects)?x.projects.filter(p=>p&&typeof p==='object').slice(0,40).map(p=>({title:clean(p.title,160),description:clean(p.description,500),skills:strings(p.skills),evidenceIds:strings(p.evidenceIds)})):[];
  return {goal:clean(x.goal),skills:strings(x.skills),projects};
}
function iso(value){return value?new Date(value).toISOString():null;}
async function validateEvidenceReferences(learnerId,projects){
  const requested=[...new Set(projects.flatMap(project=>project.evidenceIds||[]))];
  if(!requested.length)return;
  const result=await sql`SELECT id FROM learning_evidence WHERE learner_id=${learnerId} AND id = ANY(${requested})`;
  const valid=new Set(result.rows.map(row=>String(row.id)));
  const invalid=requested.filter(ref=>!valid.has(String(ref)));
  if(invalid.length){
    const error=new Error('One or more career-preparation evidence references are not valid for this learner.');
    error.status=400; error.code='INVALID_EVIDENCE_REFERENCE'; error.invalidEvidenceIds=invalid.slice(0,10); throw error;
  }
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  try{
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    await requireLearnerAccess(session,learnerId);
    if(req.method==='GET'){
      const r=await sql`SELECT learner_id AS "learnerId",goal,skills,projects,created_at AS "createdAt",updated_at AS "updatedAt" FROM career_prep_profiles WHERE learner_id=${learnerId} LIMIT 1`;
      return json(res,200,{ok:true,profile:r.rows[0]||{learnerId,goal:'',skills:[],projects:[],updatedAt:null}},NO_STORE);
    }
    if(req.method==='PUT'){
      const payload=body(req)||{};
      const profile=normalize(payload);
      await validateEvidenceReferences(learnerId,profile.projects);
      const expectedRaw=payload.expectedUpdatedAt;
      const expected=expectedRaw==null?'':String(expectedRaw).trim();
      if(expected&&Number.isNaN(Date.parse(expected))) return json(res,400,{ok:false,error:{code:'INVALID_VERSION',message:'expectedUpdatedAt must be a valid timestamp.'}},NO_STORE);
      const result=await sql.begin(async tx=>{
        const current=await tx`SELECT updated_at AS "updatedAt" FROM career_prep_profiles WHERE learner_id=${learnerId} FOR UPDATE`;
        const currentUpdatedAt=iso(current.rows[0]?.updatedAt);
        if(expected&&currentUpdatedAt!==expected)return {conflict:true,currentUpdatedAt};
        if(expected&&!currentUpdatedAt)return {conflict:true,currentUpdatedAt:null};
        const saved=await tx`INSERT INTO career_prep_profiles(learner_id,goal,skills,projects,updated_at) VALUES(${learnerId},${profile.goal},${JSON.stringify(profile.skills)}::jsonb,${JSON.stringify(profile.projects)}::jsonb,NOW()) ON CONFLICT(learner_id) DO UPDATE SET goal=EXCLUDED.goal,skills=EXCLUDED.skills,projects=EXCLUDED.projects,updated_at=NOW() RETURNING learner_id AS "learnerId",goal,skills,projects,updated_at AS "updatedAt"`;
        return {conflict:false,row:saved.rows[0]};
      });
      if(result.conflict)return json(res,409,{ok:false,error:{code:'CAREER_PREP_CONFLICT',message:'Career-preparation profile changed elsewhere. Refresh before saving again.'},current:{updatedAt:result.currentUpdatedAt}},NO_STORE);
      const evidenceReferenceCount=profile.projects.reduce((n,p)=>n+p.evidenceIds.length,0);
      await writeAudit({actorUserId:session.user_id,action:'CAREER_PREP_PROFILE_UPSERT',entityType:'learner',entityId:learnerId,metadata:{projectCount:profile.projects.length,skillCount:profile.skills.length,evidenceReferenceCount,version:iso(result.row.updatedAt)}});
      return json(res,200,{ok:true,learnerId,profile:result.row},NO_STORE);
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT',...NO_STORE});
  }catch(e){
    const details=e.code==='INVALID_EVIDENCE_REFERENCE'?{invalidEvidenceIds:e.invalidEvidenceIds}:{ };
    return json(res,e.status||500,{error:{code:e.code||'CAREER_PREP_FAILED',message:e.status?e.message:'Unable to load or save career preparation profile.',...details}},NO_STORE);
  }
}
