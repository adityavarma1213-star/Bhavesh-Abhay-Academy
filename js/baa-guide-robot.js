/* BAA M63 — Guide Robot.
 * Deterministic contextual explainer. No LLM call, no fabricated actions,
 * no backend persistence. Content comes only from BAAGuideCatalogue.
 * Role visibility is server-authoritative; browser storage is never trusted
 * for access control.
 */
(function(global){
  'use strict';
  if(global.BAAGuideRobot) return;
  const C=global.BAAGuideCatalogue;
  if(!C) return;
  let mounted=false, features=[], roles=[], role=null, roleResolved=false;
  function esc(value){return String(value==null?'':value).replace(/[&<>\"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch];});}
  function detectRole(){
    role=null; roles=[]; roleResolved=false;
    return fetch('/api/auth/me',{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}).then(function(r){
      if(!r.ok) return null;
      return r.json();
    }).then(function(s){
      const rs=s&&s.user&&(s.user.roles||s.user.role);
      if(Array.isArray(rs)) roles=rs.map(function(v){return String(v||'').trim().toLowerCase();}).filter(Boolean);
      else if(rs) roles=[String(rs).trim().toLowerCase()];
      role=roles[0]||null;
      roleResolved=true;
      return role;
    }).catch(function(){roleResolved=true;return null;});
  }
  function allowed(f){
    if(!roleResolved) return false;
    if(!Array.isArray(f.roles)||f.roles.length===0) return true;
    const allowedRoles=f.roles.map(function(v){return String(v||'').trim().toLowerCase();});
    return roles.some(function(r){return allowedRoles.includes(r);});
  }
  function currentPath(){return (global.location.pathname||'').split('/').pop()||'index.html';}
  function render(){
    const root=document.getElementById('baaGuideRobotRoot');
    if(!root) return;
    const options=root.querySelector('#baaGuideRobotOptions'),answer=root.querySelector('#baaGuideRobotAnswer'),status=root.querySelector('#baaGuideRobotStatus');
    if(!roleResolved){
      options.innerHTML='';
      status.textContent='Checking your workspace access…';
      return;
    }
    features=C.getFeatures().filter(allowed);
    const here=C.getFeatures().find(function(f){return f.route===currentPath() && allowed(f);});
    options.innerHTML=features.map(function(f){return '<button class="baa-guide-option" type="button" data-guide-id="'+esc(f.id)+'" role="listitem"><span class="baa-guide-option-icon" aria-hidden="true">'+esc(f.icon)+'</span><span><strong>'+esc(f.title)+'</strong><small>'+esc(f.description)+'</small></span><span class="baa-guide-arrow" aria-hidden="true">›</span></button>';}).join('');
    if(!features.length) options.innerHTML='<p class="baa-guide-empty">No features are available for this workspace yet.</p>';
    const roleLabel=roles.length?roles.join(', '):'public';
    status.textContent=here?'You are on '+here.title+'. Choose it for a contextual explanation, or explore another feature.':(roles.length?'Showing features available to your '+roleLabel+' workspace.':'Showing public BAA feature guidance. Sign in for role-specific guidance.');
    options.querySelectorAll('[data-guide-id]').forEach(function(el){el.addEventListener('click',function(){explain(el.dataset.guideId);});});
    if(here && answer.hidden){
      explain(here.id);
    }
  }
  function explain(id){
    const f=C.getFeature(id);if(!f||!allowed(f)) return;
    const answer=document.getElementById('baaGuideRobotAnswer');
    answer.hidden=false;answer.innerHTML='<div class="baa-guide-answer-title">'+esc(f.icon)+' '+esc(f.title)+'</div><p>'+esc(f.description)+'</p><a class="baa-guide-go" href="'+esc(f.route)+'">Open '+esc(f.title)+' <span aria-hidden="true">→</span></a>';
    answer.focus();
  }
  function mount(){
    if(mounted||!document.body) return;
    mounted=true;
    const root=document.createElement('div');root.id='baaGuideRobotRoot';root.className='baa-guide-root';
    root.innerHTML='<button id="baaGuideRobotButton" class="baa-guide-launcher" type="button" aria-label="Open BAA Guide Robot" aria-haspopup="dialog" aria-expanded="false" aria-controls="baaGuideRobotPanel"><span class="baa-guide-robot-face" aria-hidden="true">🤖</span><span class="baa-guide-launcher-text">Guide</span></button><section id="baaGuideRobotPanel" class="baa-guide-panel" role="dialog" aria-modal="false" aria-labelledby="baaGuideRobotTitle" hidden><header class="baa-guide-header"><div><div id="baaGuideRobotTitle" class="baa-guide-title">BAA Guide Robot</div><div class="baa-guide-subtitle">Ask me what you want explained.</div></div><button id="baaGuideRobotClose" class="baa-guide-close" type="button" aria-label="Close Guide Robot">×</button></header><div id="baaGuideRobotStatus" class="baa-guide-status" role="status" aria-live="polite">Checking your workspace access…</div><div id="baaGuideRobotOptions" class="baa-guide-options" role="list"></div><div id="baaGuideRobotAnswer" class="baa-guide-answer" tabindex="-1" aria-live="polite" hidden></div></section>';
    document.body.appendChild(root);
    const button=root.querySelector('#baaGuideRobotButton'),panel=root.querySelector('#baaGuideRobotPanel'),close=root.querySelector('#baaGuideRobotClose'),options=root.querySelector('#baaGuideRobotOptions'),answer=root.querySelector('#baaGuideRobotAnswer');
    function open(){panel.hidden=false;button.setAttribute('aria-expanded','true');root.classList.add('is-open');render();if(!roleResolved){detectRole().then(render);}else{const first=options.querySelector('[data-guide-id]');if(first)first.focus();}}
    function shut(){panel.hidden=true;button.setAttribute('aria-expanded','false');root.classList.remove('is-open');button.focus();}
    button.addEventListener('click',function(){panel.hidden?open():shut();});close.addEventListener('click',shut);
    root.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden)shut();});
    document.addEventListener('click',function(e){if(!root.contains(e.target)&&!panel.hidden)shut();});
    detectRole().then(function(){if(!panel.hidden)render();});
    const here=C.getFeatures().find(function(f){return f.route===currentPath();});
    if(here) button.title='Guide for '+here.title;
  }
  function init(){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
  global.BAAGuideRobot={init:init,open:function(){const b=document.getElementById('baaGuideRobotButton');if(b)b.click();},getCurrentRole:function(){return roleResolved?role:null;},getCurrentRoles:function(){return roleResolved?roles.slice():null;},getFeatures:function(){return C.getFeatures();}};
  init();
})(window);