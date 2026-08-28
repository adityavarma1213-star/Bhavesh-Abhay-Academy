// M03 — authenticated parental-consent record.
// This is an auditable server record tied to an existing parent/learner
// relationship. It is intentionally NOT described as legal consent or
// jurisdictional compliance verification.
import { json, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};

function noStore(res){res.setHeader('Cache-Control','private, no-store, max-age=0');}

async function requireParentLearnerLink(session, learnerId){
  if(!hasRole(session,'parent')){
    const e=new Error('Parent role required.'); e.status=403; e.code='PARENT_ROLE_REQUIRED'; throw e;
  }
  const r=await sql`SELECT 1 FROM parent_learner WHERE parent_user_id=${session.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;
  if(!r.rows.length){
    const e=new Error('You are not authorized to manage consent for this learner.'); e.status=403; e.code='LEARNER_FORBIDDEN'; throw e;
  }
}

export default async function handler(req,res){
  noStore(res);
  try{
    const session=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'').trim();
    if(!learnerId) return json(res,400,{error:{code:'INVALID_LEARNER_ID',message:'learnerId is required.'}});
    await requireParentLearnerLink(session,learnerId);

    if(req.method==='GET'){
      const r=await sql`SELECT learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,created_at,updated_at FROM parental_consents WHERE learner_id=${learnerId} AND parent_user_id=${session.user_id} LIMIT 1`;
      return json(res,200,{ok:true,consent:r.rows[0]||null,verifiedRelationship:true,legalVerification:false});
    }

    if(req.method==='PUT'){
      const policyVersion=String(req.body?.policyVersion||'').trim().slice(0,120);
      const action=String(req.body?.action||'').trim();
      if(!policyVersion) return json(res,400,{error:{code:'INVALID_POLICY_VERSION',message:'policyVersion is required.'}});
      if(!['grant','revoke'].includes(action)) return json(res,400,{error:{code:'INVALID_CONSENT_ACTION',message:'action must be grant or revoke.'}});
      const r=action==='grant'
        ? await sql`INSERT INTO parental_consents(learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,updated_at) VALUES(${learnerId},${session.user_id},${policyVersion},'granted',NOW(),NULL,NOW()) ON CONFLICT(learner_id,parent_user_id) DO UPDATE SET policy_version=EXCLUDED.policy_version,status='granted',consented_at=NOW(),revoked_at=NULL,updated_at=NOW() RETURNING learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,updated_at`
        : await sql`INSERT INTO parental_consents(learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,updated_at) VALUES(${learnerId},${session.user_id},${policyVersion},'revoked',NULL,NOW(),NOW()) ON CONFLICT(learner_id,parent_user_id) DO UPDATE SET policy_version=EXCLUDED.policy_version,status='revoked',revoked_at=NOW(),updated_at=NOW() RETURNING learner_id,parent_user_id,policy_version,status,consented_at,revoked_at,updated_at`;
      await writeAudit({actorUserId:session.user_id,action:action==='grant'?'PARENTAL_CONSENT_GRANTED':'PARENTAL_CONSENT_REVOKED',entityType:'learner',entityId:learnerId,metadata:{policyVersion}});
      return json(res,200,{ok:true,consent:r.rows[0],verifiedRelationship:true,legalVerification:false});
    }

    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'PARENTAL_CONSENT_FAILED',message:e.status?e.message:'Unable to process parental consent.'}});}
}
