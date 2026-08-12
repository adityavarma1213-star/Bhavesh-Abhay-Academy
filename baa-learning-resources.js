/* ============================================================
   BAA Module 27 — AI Learning Resources
   Conservative implementation of the Blueprint's multimodal
   resource-curation purpose. It recommends resource formats from
   real learning evidence and an explicit student format preference.
   It does NOT diagnose a "learning style", invent resource content,
   or claim external resources have been quality-validated.
   ============================================================ */
(function(global){
'use strict';

const FORMATS=[
  {id:'visual',label:'Visual / diagram',provider:'Khan Academy search',url:(q)=>'https://www.khanacademy.org/search?search_again=1&page_search_query='+encodeURIComponent(q)},
  {id:'video',label:'Video explanation',provider:'YouTube search',url:(q)=>'https://www.youtube.com/results?search_query='+encodeURIComponent(q)},
  {id:'interactive',label:'Interactive exploration',provider:'PhET search',url:(q)=>'https://phet.colorado.edu/en/search?q='+encodeURIComponent(q)},
  {id:'practice',label:'Practice / worked examples',provider:'BAA Assessments',url:()=> 'assessment.html'}
];

function normalizeFormat(x){return FORMATS.some(f=>f.id===x)?x:null;}
function getPreference(){
  try{
    const raw=localStorage.getItem('baa_resource_preferences');
    const parsed=raw?JSON.parse(raw):{};
    return normalizeFormat(parsed.format)||null;
  }catch(_){return null;}
}
function setPreference(format){
  const value=normalizeFormat(format);
  if(!value)return {ok:false,error:'INVALID_RESOURCE_FORMAT'};
  try{
    localStorage.setItem('baa_resource_preferences',JSON.stringify({
      schemaVersion:1,format:value,updatedAt:new Date().toISOString()
    }));
    return {ok:true,error:null};
  }catch(_){return {ok:false,error:'PREFERENCE_STORAGE_FAILED'};}
}

function getEvidence(){
  const a=global.BAAAssessment;
  if(!a)return {ok:false,error:'NOT_READY',states:[]};
  const i=global.BAAIntelligence;
  let states=[];
  if(i&&typeof i.getConceptStates==='function')states=i.getConceptStates();
  if(!Array.isArray(states)||!states.length){
    const profile=typeof a.getAcademicProfile==='function'?a.getAcademicProfile():{};
    const concepts=[...(profile.strengths||[]),...(profile.weaknesses||[])];
    states=concepts.map(x=>({
      concept:x.concept,subject:x.subject,status:x.status,evidenceCount:x.evidenceCount||0
    }));
  }
  return {ok:true,error:null,states};
}

function rankFormats(state,preferred){
  const out=[];
  const push=(id,reason,score)=>out.push({id,reason,score});
  if(preferred)push(preferred,'Student-selected format preference.',5);
  if(state.status==='needs_revision'||state.status==='struggling'){
    push('visual','A visual representation can provide another explanation route.',4);
    push('video','A guided explanation provides another presentation route.',3);
    push('practice','Targeted practice reinforces the recorded weak concept.',3);
  }else if(state.status==='learning'){
    push('video','A guided explanation can reinforce the concept while it is still learning.',3);
    push('practice','Practice can test transfer after explanation.',3);
    push('visual','A visual summary can reinforce the concept.',2);
  }else{
    push('practice','Practice can extend an evidence-backed strong concept.',4);
    push('visual','A visual summary can consolidate understanding.',3);
    push('interactive','An interactive exploration can extend application.',2);
  }
  if(state.subject==='Science')push('interactive','Interactive exploration is available for science concepts.',3);
  const seen=new Set();
  return out.filter(x=>!seen.has(x.id)&&seen.add(x.id)).sort((a,b)=>b.score-a.score).slice(0,4);
}

function getRecommendations(limit=8){
  const ev=getEvidence();
  if(!ev.ok)return ev;
  const preferred=getPreference();
  const recommendations=[];
  ev.states.filter(s=>s&&s.concept).slice(0,20).forEach(state=>{
    rankFormats(state,preferred).slice(0,2).forEach(r=>{
      const format=FORMATS.find(f=>f.id===r.id);
      const query=`${state.subject||''} ${String(state.concept).replace(/-/g,' ')}`.trim();
      recommendations.push({
        concept:state.concept,subject:state.subject||null,status:state.status||'unknown',
        evidenceCount:Number(state.evidenceCount)||0,format:r.id,formatLabel:format.label,
        provider:format.provider,url:format.url(query),reason:r.reason
      });
    });
  });
  return {ok:true,error:null,preference:preferred,recommendations:recommendations.slice(0,Math.max(1,Math.min(20,Number(limit)||8)))};
}

global.BAALearningResources={getPreference,setPreference,getRecommendations};
})(window);
