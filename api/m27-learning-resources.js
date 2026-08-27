import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const FORMATS = new Set(['visual','video','interactive','practice']);
const clean = (v, max=160) => String(v ?? '').trim().slice(0,max);
const encode = (v) => encodeURIComponent(String(v || '').trim());
function urlFor(format, query){
  const q=encode(query);
  if(format==='visual') return `https://www.khanacademy.org/search?search_again=1&page_search_query=${q}`;
  if(format==='video') return `https://www.youtube.com/results?search_query=${q}`;
  if(format==='interactive') return `https://phet.colorado.edu/en/search?q=${q}`;
  return 'assessment.html';
}
function rank(state, preferred){
  const out=[]; const push=(id,reason,score)=>out.push({id,reason,score});
  if(preferred && FORMATS.has(preferred)) push(preferred,'Student-selected format preference.',5);
  if(state.status==='struggling'||state.status==='needs_revision'){
    push('visual','A visual representation can provide another explanation route.',4);
    push('video','A guided explanation provides another presentation route.',3);
    push('practice','Targeted practice reinforces the recorded weak concept.',3);
  } else if(state.status==='learning'){
    push('video','A guided explanation can reinforce a concept still being learned.',3);
    push('practice','Practice can test transfer after explanation.',3);
    push('visual','A visual summary can reinforce the concept.',2);
  } else {
    push('practice','Practice can extend an evidence-backed strong concept.',4);
    push('visual','A visual summary can consolidate understanding.',3);
    push('interactive','An interactive exploration can extend application.',2);
  }
  if(state.subject==='Science') push('interactive','Interactive exploration is available for science concepts.',3);
  const seen=new Set();
  return out.filter(x=>!seen.has(x.id)&&seen.add(x.id)).sort((a,b)=>b.score-a.score).slice(0,3);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    await requireLearnerAccess(session,learnerId);
    const preferred=clean(req.query?.format,30);
    const preference=FORMATS.has(preferred)?preferred:null;
    const rows=await sql`SELECT subject,chapter,concept,
      COUNT(*)::int AS evidence_count,
      COUNT(*) FILTER (WHERE correctness='incorrect')::int AS incorrect_count,
      COUNT(*) FILTER (WHERE correctness='partially_correct')::int AS partial_count,
      MAX(created_at) AS last_seen
      FROM learning_evidence WHERE learner_id=${learnerId}
      GROUP BY subject,chapter,concept ORDER BY last_seen DESC LIMIT 100`;
    const recommendations=[];
    for(const r of rows.rows){
      const evidence=Number(r.evidence_count||0), incorrect=Number(r.incorrect_count||0), partial=Number(r.partial_count||0);
      const status=incorrect>=2?'struggling':partial>=1?'needs_revision':evidence<3?'learning':'stable';
      const state={subject:r.subject||null,concept:r.concept||'Unspecified concept',status};
      const query=`${r.subject||''} ${String(r.concept||'').replace(/-/g,' ')}`.trim();
      for(const rec of rank(state,preference)){
        const label={visual:'Visual / diagram',video:'Video explanation',interactive:'Interactive exploration',practice:'Practice / worked examples'}[rec.id];
        const provider={visual:'Khan Academy search',video:'YouTube search',interactive:'PhET search',practice:'BAA Assessments'}[rec.id];
        recommendations.push({concept:state.concept,subject:state.subject,chapter:r.chapter||null,status,evidenceCount:evidence,format:rec.id,formatLabel:label,provider,url:urlFor(rec.id,query),reason:rec.reason});
        if(recommendations.length>=20) break;
      }
      if(recommendations.length>=20) break;
    }
    return json(res,200,{ok:true,learnerId,preference,recommendations,source:'server_learning_evidence',limitation:'External search destinations are not BAA-validated resources and this feature does not infer a psychological learning style.'});
  }catch(e){
    return json(res,e.status||500,{error:{code:e.code||'LEARNING_RESOURCES_FAILED',message:e.status?e.message:'Unable to load learning resources.'}});
  }
}
