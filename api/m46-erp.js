import { json, id } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};

export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(!hasRole(s,'admin')&&!hasRole(s,'teacher')) return json(res,403,{error:{code:'FORBIDDEN',message:'School administrator or teacher role required.'}});
    if(req.method==='GET'){
      const r=await sql`SELECT id,provider,base_url AS "baseUrl",status,last_sync_at AS "lastSyncAt",last_error AS "lastError",metadata FROM erp_connections WHERE owner_user_id=${s.user_id} ORDER BY created_at DESC`;
      return json(res,200,{ok:true,connections:r.rows});
    }
    if(req.method==='POST' && req.query?.action==='sync'){
      const connectionId=String(req.query?.id||'');
      const c=await sql`SELECT id FROM erp_connections WHERE id=${connectionId} AND owner_user_id=${s.user_id} LIMIT 1`;
      if(!c.rows.length) return json(res,404,{error:{code:'ERP_NOT_FOUND',message:'ERP connection not found.'}});
      const runId=id('erprun');
      await sql`INSERT INTO erp_sync_runs(id,connection_id,direction,entity_type,status,started_at) VALUES(${runId},${connectionId},${String(req.body?.direction||'pull')==='push'?'push':'pull'},${String(req.body?.entityType||'students').slice(0,80)},'queued',NOW())`;
      return json(res,202,{ok:true,id:runId,status:'queued',message:'Synchronization is queued. No external provider is contacted until deployment credentials and the provider adapter are configured.'});
    }
    if(req.method==='POST'){
      const b=req.body||{}; const provider=String(b.provider||'').trim().slice(0,100); const baseUrl=String(b.baseUrl||'').trim();
      if(!provider||!/^https:\/\//i.test(baseUrl)) return json(res,400,{error:{code:'INVALID_ERP_CONFIG',message:'provider and an HTTPS baseUrl are required.'}});
      const connectionId=id('erp');
      await sql`INSERT INTO erp_connections(id,owner_user_id,provider,base_url,credential_ref,status,metadata) VALUES(${connectionId},${s.user_id},${provider},${baseUrl},${b.credentialRef?String(b.credentialRef).slice(0,240):null},'configured',${JSON.stringify(b.metadata&&typeof b.metadata==='object'?b.metadata:{})}::jsonb)`;
      return json(res,201,{ok:true,id:connectionId,status:'configured',message:'ERP adapter configured. A provider credential must be supplied through the deployment secret manager before synchronization.'});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'ERP_FAILED',message:e.status?e.message:'Unable to process ERP request.'}});}
}
