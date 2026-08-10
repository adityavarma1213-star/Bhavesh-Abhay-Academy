import { sql } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { json, id, writeAudit } from '../_lib/security.js';
export const config={runtime:'nodejs'};
const TYPES=new Set(['data_processing','ai_evaluation','notifications','research_testing','voice_processing']);
export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const r=await sql`SELECT consent_type,granted,granted_at FROM consent_preferences WHERE user_id=${s.user_id} ORDER BY consent_type`;
      return json(res,200,{ok:true,consents:r.rows});
    }
    if(req.method==='PUT'){
      const {consentType,granted}=req.body||{};
      if(!TYPES.has(consentType)||typeof granted!=='boolean') return json(res,400,{error:{code:'INVALID_CONSENT',message:'Invalid consent type or value.'}});
      await sql`INSERT INTO consent_preferences(id,user_id,consent_type,granted,granted_at) VALUES(${id('consent')},${s.user_id},${consentType},${granted},NOW()) ON CONFLICT(user_id,consent_type) DO UPDATE SET granted=EXCLUDED.granted,granted_at=EXCLUDED.granted_at`;
      await writeAudit({actorUserId:s.user_id,action:'consent.update',entityType:'consent_preferences',entityId:`${s.user_id}:${consentType}`,metadata:{consentType,granted}});
      return json(res,200,{ok:true,consentType,granted});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'CONSENT_FAILED',message:e.status?e.message:'Consent operation failed.'}});}
}
