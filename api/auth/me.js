import { requireAuth } from '../_lib/auth.js';
import { json } from '../_lib/security.js';
export const config={runtime:'nodejs'};
export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{const s=await requireAuth(req);return json(res,200,{ok:true,user:{id:s.user_id,name:s.display_name,email:s.email,roles:s.roles},expiresAt:s.expires_at});}
  catch(e){return json(res,e.status||500,{error:{code:e.code||'SESSION_LOOKUP_FAILED',message:e.status?e.message:'Unable to resolve session.'}});}
}
