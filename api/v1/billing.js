import { sql } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { json, id, writeAudit } from '../_lib/security.js';
export const config={runtime:'nodejs'};
const PLANS={free:{price:0},student:{price:199},family:{price:499},institution:{price:null}};
export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const [sub,ent]=await Promise.all([
        sql`SELECT id,plan_id,status,provider,started_at,renewal_at FROM subscriptions WHERE user_id=${s.user_id} AND status IN ('active','trial') ORDER BY created_at DESC LIMIT 1`,
        sql`SELECT feature,allowed,source,expires_at FROM entitlements WHERE user_id=${s.user_id}`
      ]);
      return json(res,200,{ok:true,subscription:sub.rows[0]||{plan_id:'free',status:'active',provider:'none'},entitlements:ent.rows});
    }
    if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}});
    const action=String(req.body?.action||'');
    if(action==='subscribe'){
      const plan=String(req.body?.planId||''); if(!PLANS[plan]) return json(res,400,{error:{code:'UNKNOWN_PLAN',message:'Unknown plan.'}});
      if(plan==='institution') return json(res,409,{error:{code:'EXTERNAL_PROVIDER_REQUIRED',message:'Institution licensing requires a configured payment/licensing provider.'}});
      await sql`UPDATE subscriptions SET status='cancelled',cancelled_at=NOW(),updated_at=NOW() WHERE user_id=${s.user_id} AND status IN ('active','trial')`;
      const subId=id('sub');
      await sql`INSERT INTO subscriptions(id,user_id,plan_id,status,provider,started_at,created_at,updated_at) VALUES(${subId},${s.user_id},${plan},'active','sandbox',NOW(),NOW(),NOW())`;
      await sql`INSERT INTO entitlements(id,user_id,feature,allowed,source,created_at,updated_at) VALUES(${id('ent')},${s.user_id},'premium',${plan!=='free'},'sandbox',NOW(),NOW()) ON CONFLICT(user_id,feature) DO UPDATE SET allowed=EXCLUDED.allowed,source='sandbox',updated_at=NOW()`;
      await writeAudit({actorUserId:s.user_id,action:'billing.sandbox_subscribe',entityType:'subscription',entityId:subId,metadata:{plan}});
      return json(res,200,{ok:true,mode:'sandbox',subscription:{id:subId,plan_id:plan,status:'active',provider:'sandbox'},limitation:'No real payment was processed.'});
    }
    return json(res,400,{error:{code:'UNKNOWN_ACTION',message:'Unsupported billing action.'}});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'BILLING_FAILED',message:e.status?e.message:'Billing operation failed.'}});}
}
