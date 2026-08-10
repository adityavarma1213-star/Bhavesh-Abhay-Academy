/* ============================================================
   BAA Module 29 — AI Learning Paths
   Builds sequential, node-based learning journeys from concepts
   already present in BAA Learning Evidence. It does NOT invent a
   curriculum, prerequisites, mastery scores, or syllabus facts.
   When no evidence exists, it honestly returns an empty path.
   ============================================================ */
(function(global){
'use strict';

const STATUS_ORDER={
  needs_revision:0,
  struggling:0,
  learning:1,
  insufficient_evidence:2,
  mastered:3,
  strong:4
};

function getStates(){
  const i=global.BAAIntelligence;
  if(!i||typeof i.getConceptStates!=='function')
    return {ok:false,error:'LEARNING_INTELLIGENCE_NOT_READY',states:[]};
  const states=i.getConceptStates();
  if(!Array.isArray(states)) return {ok:false,error:'INVALID_CONCEPT_STATES',states:[]};
  return {ok:true,error:null,states:states.filter(s=>s&&s.concept)};
}

function buildPath(subject, limit){
  const result=getStates();
  if(!result.ok)return result;
  let states=result.states.slice();
  if(subject) states=states.filter(s=>String(s.subject||'')===String(subject));
  if(!states.length)return {ok:true,error:null,subject:subject||null,nodes:[],hasEvidence:false};

  // No hidden prerequisite claims: order is a transparent learning queue.
  // Weak/revision concepts come first; then learning; then insufficient evidence.
  states.sort((a,b)=>{
    const sa=STATUS_ORDER[a.state||a.status] ?? 2;
    const sb=STATUS_ORDER[b.state||b.status] ?? 2;
    return sa-sb || (Number(a.evidenceCount)||0)-(Number(b.evidenceCount)||0);
  });

  const nodes=states.slice(0,Math.max(1,Math.min(30,Number(limit)||12))).map((s,index)=>{
    const state=s.state||s.status||'insufficient_evidence';
    const isCurrent=index===0;
    let action='Build evidence';
    if(state==='needs_revision'||state==='struggling') action='Review and retry';
    else if(state==='learning') action='Practice next';
    else if(state==='mastered'||state==='strong') action='Extend and check';
    return {
      nodeId:`path_${String(s.concept).replace(/[^a-z0-9]+/gi,'_').toLowerCase()}_${index+1}`,
      order:index+1,
      concept:s.concept,
      subject:s.subject||null,
      state,
      evidenceCount:Number(s.evidenceCount)||0,
      confidence:s.confidence||'insufficient_evidence',
      action,
      current:isCurrent,
      prerequisiteClaim:null
    };
  });

  return {
    ok:true,error:null,subject:subject||null,
    pathType:'evidence_priority_queue',
    hasEvidence:true,
    nodes,
    limitation:'Node order is generated from current evidence state. BAA has not inferred a canonical syllabus prerequisite graph.'
  };
}

function getSubjects(){
  const r=getStates();
  if(!r.ok)return r;
  return {ok:true,error:null,subjects:[...new Set(r.states.map(s=>s.subject).filter(Boolean))].sort()};
}

function getCurrentPath(subject,limit){return buildPath(subject,limit);}

global.BAALearningPaths={getCurrentPath,getSubjects};
})(window);
