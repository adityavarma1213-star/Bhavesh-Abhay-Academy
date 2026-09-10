import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';
export const config={runtime:'nodejs'};
export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  const configured=Boolean(process.env.POSTGRES_URL||process.env.POSTGRES_URL_NON_POOLING);
  if(!configured) return json(res,503,{ok:false,status:'unavailable'});
  try{await sql`SELECT 1 AS ok`;return json(res,200,{ok:true,status:'healthy'});}catch(e){return json(res,503,{ok:false,status:'degraded'});}
}
