import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

const ORDER={needs_revision:0,struggling:0,learning:1,insufficient_evidence:2,mastered:3,strong:4};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const PAGE_SIZE=500;

function requireBounded(value,max,name){
  const raw=String(value??'').trim();
  if(raw.length>max){const e=new Error(`${name} exceeds the maximum length of ${max} characters.`);e.status=400;e.code='VALUE_TOO_LONG';throw e;}
  return raw;
}

async function loadAllEvidence(learnerId){
  const rows=[];
  let cursor=null;
  for(;;){
    const page=cursor
      ? await sql`SELECT id,subject,chapter,concept,correctness,created_at FROM learning_evidence WHERE learner_id=${learnerId} AND (created_at>${cursor.createdAt} OR (created_at=${cursor.createdAt} AND id>${cursor.id})) ORDER BY created_at ASC,id ASC LIMIT ${PAGE_SIZE}`
      : await sql`SELECT id,subject,chapter,concept,correctness,created_at FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at ASC,id ASC LIMIT ${PAGE_SIZE}`;
    const batch=Array.isArray(page?.rows)?page.rows:[];
    rows.push(...batch);
    if(batch.length<PAGE_SIZE)break;
    const last=batch[batch.length-1];
    cursor={createdAt:last.created_at,id:last.id};
  }
  return rows;
}

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
    const recent=item.recent.slice(-5);
    const recentAccuracy=recent.length?Math.round(recent.filter(x=>x==='correct').length/recent.length*100):0;
    const recentIncorrect=recent.filter(x=>x!=='correct').length;
    let state='insufficient_evidence';
    if(item.total>=3){
      if(recentAccuracy>=80) state='mastered';
      else if(recentAccuracy>=60) state='learning';
      else state='needs_revision';
      if(recentAccuracy<=25 || recentIncorrect>=4) state='struggling';
      if(item.total>=6 && recent.length>=4 && recentAccuracy>=80 && recent.every(x=>x==='correct')) state='strong';
    }
    return {...item,accuracy,recentAccuracy,state,confidence:item.total>=6?'high':item.total>=3?'observed':'insufficient_evidence'};
  });
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const session=await requireAuth(req);
    const learnerId=requireBounded(req.query?.learnerId,160,'learnerId');
    await requireLearnerAccess(session,learnerId);
    const subject=req.query?.subject?requireBounded(req.query.subject,120,'subject'):null;
    const limit=clamp(Number(req.query?.limit)||12,1,30);
    const evidenceRows=await loadAllEvidence(learnerId);
    let states=buildStates(evidenceRows);
    if(subject)states=states.filter(s=>s.subject===subject);
    states.sort((a,b)=>(ORDER[a.state]??2)-(ORDER[b.state]??2)||(a.total-b.total));
    const nodes=states.slice(0,limit).map((s,index)=>({
      nodeId:`path_${String(s.concept).replace(/[^a-z0-9]+/gi,'_').toLowerCase()}_${index+1}`,
      order:index+1,concept:s.concept,subject:s.subject,state:s.state,evidenceCount:s.total,accuracy:s.accuracy,recentAccuracy:s.recentAccuracy,confidence:s.confidence,
      action:s.state==='struggling'||s.state==='needs_revision'?'Review and retry':s.state==='learning'?'Practice next':s.state==='mastered'||s.state==='strong'?'Extend or reassess':'Build evidence',
      current:index===0,prerequisiteClaim:null
    }));
    return json(res,200,{ok:true,learnerId,subject,nodes,hasEvidence:Boolean(nodes.length),pathType:'evidence_priority_queue',evidencePoints:evidenceRows.length,source:'server_learning_evidence',limitation:'Node order is generated from the complete stored evidence history. BAA has not inferred a canonical syllabus prerequisite graph.'});
  }catch(error){
    return json(res,error.status||500,{error:{code:error.code||'LEARNING_PATH_FAILED',message:error.status?error.message:'Unable to build learning path.'}});
  }
}