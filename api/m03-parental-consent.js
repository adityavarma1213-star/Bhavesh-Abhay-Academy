// M03 — authenticated parental-consent record.
// This is an auditable server record tied to an existing parent/learner
// relationship. It is intentionally NOT described as legal consent or
// jurisdictional compliance verification.
import { json, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};
const MAX_LEARNER_ID=100;
const MAX_POLICY_VERSION=120;
function noStore(res){res.setHeader('Cache-Control','private, no-store, max-age=0');}

async function requireParentLearnerLink(session, learnerId){
  if(!hasRole(session,'parent')){ const e=new Error('Parent role required.'); e.status=403; e.code='PARENT_ROLE_REQUIRED'; throw e; }
  const r=await sql`SELECT 1 FROM parent_learner WHERE parent_user_id=${session.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;
  if(!r.rows.length){ const e=new Error('You are not authorized to manage consent for this learner.'); e.status=403; e.code='LEARNER_FORBIDDEN'; throw e; }
}
function normalizeVersion(value){ const v=String(value||'').trim(); return v && v.length<=80 ? v : ''; }
function normalizeLearnerId(value){ const v=typeof value==='string'?value.trim():''; return v && v.length<=MAX_LEARNER_ID ? v : ''; }
function normalizePolicyVersion(value){ const v=typeof value==='string'?value.trim():''; return v && v.length<=MAX_POLICY_VERSION ? v : ''; }
function conflict(res){ return json(res,409,{error:{code:'CONSENT_CONFLICT',message:'Parental consent changed since it was loaded. Refresh and review the current policy before saving.'}}); }

export default async function handler(req,res){
  noStore(res);
  try{
    const session=await requireAuth(req);
    const learnerId=normalizeLearnerId(req.query?.learnerId);
    if(!learnerId) return json(res,400,{error:{code:'INVALID_LEARNER_ID',message:'A valid learner identifier is required.'}});
    await requireParentLearnerLink(session,learnerId);
    if(req.method==='GET'){
      const r=await sql`SELECT learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,created_at,updated_at FROM parental_consents WHERE learner_id=${learnerId} AND parent_user_id=${session.user_id} LIMIT 1`;
      return json(res,200,{ok:true,consent:r.rows[0]||null,verifiedRelationship:true,legalVerification:false,version:r.rows[0]?.updated_at||null});
    }
    if(req.method==='PUT'){
      const policyVersion=normalizePolicyVersion(req.body?.policyVersion);
      const action=String(req.body?.action||'').trim();
      const expectedUpdatedAt=normalizeVersion(req.body?.expectedUpdatedAt);
      if(!policyVersion) return json(res,400,{error:{code:'INVALID_POLICY_VERSION',message:'A policy version between 1 and 120 characters is required.'}});
      if(!['grant','revoke'].includes(action)) return json(res,400,{error:{code:'INVALID_CONSENT_ACTION',message:'action must be grant or revoke.'}});

      const current=await sql`SELECT updated_at FROM parental_consents WHERE learner_id=${learnerId} AND parent_user_id=${session.user_id} LIMIT 1`;
      const currentVersion=current.rows[0]?.updated_at ? new Date(current.rows[0].updated_at).toISOString() : '';
      if(currentVersion ? currentVersion!==expectedUpdatedAt : Boolean(expectedUpdatedAt)) return conflict(res);

      let r;
      if(action==='grant'){
        r=await sql`INSERT INTO parental_consents(learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,updated_at) VALUES(${learnerId},${session.user_id},${policyVersion},'granted',NOW(),NULL,NOW()) ON CONFLICT(learner_id,parent_user_id) DO UPDATE SET policy_version=EXCLUDED.policy_version,status='granted',consented_at=NOW(),revoked_at=NULL,updated_at=NOW() WHERE parental_consents.updated_at=${current.rows[0]?.updated_at || null} RETURNING learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,updated_at`;
      } else {
        r=await sql`INSERT INTO parental_consents(learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,updated_at) VALUES(${learnerId},${session.user_id},${policyVersion},'revoked',NULL,NOW(),NOW()) ON CONFLICT(learner_id,parent_user_id) DO UPDATE SET policy_version=EXCLUDED.policy_version,status='revoked',revoked_at=NOW(),updated_at=NOW() WHERE parental_consents.updated_at=${current.rows[0]?.updated_at || null} RETURNING learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,updated_at`;
      }
      if(!r.rows.length) return conflict(res);
      await writeAudit({actorUserId:session.user_id,action:action==='grant'?'PARENTAL_CONSENT_GRANTED':'PARENTAL_CONSENT_REVOKED',entityType:'learner',entityId:learnerId,metadata:{policyVersion}});
      return json(res,200,{ok:true,consent:r.rows[0],verifiedRelationship:true,legalVerification:false,version:r.rows[0].updated_at});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'PARENTAL_CONSENT_FAILED',message:e.status?e.message:'Unable to process parental consent.'}});}
}
