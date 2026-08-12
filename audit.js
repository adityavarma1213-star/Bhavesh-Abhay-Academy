import { sql } from '../_lib/db.js';
import { requireAuth, hasRole } from '../_lib/auth.js';
import { json } from '../_lib/security.js';
export const config={runtime:'nodejs'};
export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(!hasRole(s,'admin')) return json(res,403,{error:{code:'ADMIN_REQUIRED',message:'Administrator role required.'}});
    if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
    const limit=Math.min(200,Math.max(1,Number(req.query?.limit||50)));
    const r=await sql`SELECT id,actor_user_id,action,entity_type,entity_id,metadata,created_at FROM audit_log ORDER BY created_at DESC LIMIT ${limit}`;
    return json(res,200,{ok:true,events:r.rows});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'AUDIT_FAILED',message:e.status?e.message:'Audit lookup failed.'}});}
}
