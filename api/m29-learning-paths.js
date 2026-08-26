import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

const ORDER={needs_revision:0,struggling:0,learning:1,insufficient_evidence:2,mastered:3,strong:4};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function buildStates(rows){
  const grouped=new Map();
  for(const row of rows){
    const key=`${row.subject||'Unknown'}::${row.concept||row.chapter||'General'}`;
    const item=grouped.get(key)||{subject:row.subject||'Unknown',concept:row.concept||row.chapter||'General',total:0,correct:0,recent:[]};
    item.total+=1;
    if(row.correctness==='correct')item.correct+=1;
    item.recent.push(row.correctness);
    if(item.recent.length>8)item.recent.shift();
    grouped.set(key,item);
  }
  return [...grouped.values()].map(item=>{
    const accuracy=item.total?Math.round(item.correct/item.total*100):0;
    const recentIncorrect=item.recent.filter(x=>x!=='correct').length;
    const state=accuracy<60||recentIncorrect>=3?'struggling':accuracy<80?'needs_revision':'learning';
    return {...item,accuracy,state,confidence:item.total>=4?'observed':'insufficient_evidence'};
  });
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const session=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    const subject=req.query?.subject?String(req.query.subject):null;
    const limit=clamp(Number(req.query?.limit)||12,1,30);
    const evidence=await sql`SELECT subject,chapter,concept,correctness,created_at FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at DESC LIMIT 300`;
    let states=buildStates(evidence.rows);
    if(subject)states=states.filter(s=>s.subject===subject);
    states.sort((a,b)=>(ORDER[a.state]??2)-(ORDER[b.state]??2)||(a.total-b.total));
    const nodes=states.slice(0,limit).map((s,index)=>({
      nodeId:`path_${String(s.concept).replace(/[^a-z0-9]+/gi,'_').toLowerCase()}_${index+1}`,
      order:index+1,concept:s.concept,subject:s.subject,state:s.state,evidenceCount:s.total,accuracy:s.accuracy,confidence:s.confidence,
      action:s.state==='struggling'||s.state==='needs_revision'?'Review and retry':s.state==='learning'?'Practice next':'Build evidence',
      current:index===0,prerequisiteClaim:null
    }));
    return json(res,200,{ok:true,learnerId,subject,nodes,hasEvidence:Boolean(nodes.length),pathType:'evidence_priority_queue',evidencePoints:evidence.rows.length,source:'server_learning_evidence',limitation:'Node order is generated from current evidence state. BAA has not inferred a canonical syllabus prerequisite graph.'});
  }catch(error){
    return json(res,error.status||500,{error:{code:error.code||'LEARNING_PATH_FAILED',message:error.status?error.message:'Unable to build learning path.'}});
  }
}
