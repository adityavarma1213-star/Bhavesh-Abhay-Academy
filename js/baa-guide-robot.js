/* BAA M63 — Guide Robot.
 * Deterministic contextual explainer. No LLM call, no fabricated actions,
 * no backend persistence. Content comes only from BAAGuideCatalogue.
 */
(function(global){
  'use strict';
  if(global.BAAGuideRobot) return;
  const C=global.BAAGuideCatalogue;
  if(!C) return;
  let mounted=false, features=[], role=null;
  function esc(value){return String(value==null?'':value).replace(/[&<>\"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch];});}
  function detectRole(){
    try{
      const raw=localStorage.getItem('baa.user')||localStorage.getItem('baa.session');
      if(raw){const parsed=JSON.parse(raw);const u=parsed.user||parsed;const rs=u&&(u.roles||u.role);if(Array.isArray(rs)) role=rs[0]||null; else if(rs) role=rs;}
    }catch(e){}
    return fetch('/api/auth/me',{credentials:'include',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(s){
      const rs=s&&s.user&&(s.user.roles||s.user.role);if(Array.isArray(rs)) role=rs[0]||role; else if(rs) role=rs; return role;
    }).catch(function(){return role;});
  }
  function allowed(f){return !role||!Array.isArray(f.roles)||f.roles.includes(role)||f.roles.includes('admin')&&role==='admin';}
  function currentPath(){return (global.location.pathname||'').split('/').pop()||'index.html';}
  function mount(){
    if(mounted||!document.body) return;
    mounted=true;
    const root=document.createElement('div');root.id='baaGuideRobotRoot';root.className='baa-guide-root';
    root.innerHTML='<button id="baaGuideRobotButton" class="baa-guide-launcher" type="button" aria-label="Open BAA Guide Robot" aria-haspopup="dialog" aria-expanded="false" aria-controls="baaGuideRobotPanel"><span class="baa-guide-robot-face" aria-hidden="true">🤖</span><span class="baa-guide-launcher-text">Guide</span></button><section id="baaGuideRobotPanel" class="baa-guide-panel" role="dialog" aria-modal="false" aria-labelledby="baaGuideRobotTitle" hidden><header class="baa-guide-header"><div><div id="baaGuideRobotTitle" class="baa-guide-title">BAA Guide Robot</div><div class="baa-guide-subtitle">Ask me what you want explained.</div></div><button id="baaGuideRobotClose" class="baa-guide-close" type="button" aria-label="Close Guide Robot">×</button></header><div id="baaGuideRobotStatus" class="baa-guide-status" role="status" aria-live="polite">Choose a feature to learn about it.</div><div id="baaGuideRobotOptions" class="baa-guide-options" role="list"></div><div id="baaGuideRobotAnswer" class="baa-guide-answer" aria-live="polite" hidden></div></section>';
    document.body.appendChild(root);
    const button=root.querySelector('#baaGuideRobotButton'),panel=root.querySelector('#baaGuideRobotPanel'),close=root.querySelector('#baaGuideRobotClose'),options=root.querySelector('#baaGuideRobotOptions'),answer=root.querySelector('#baaGuideRobotAnswer'),status=root.querySelector('#baaGuideRobotStatus');
    function render(){
      features=C.getFeatures().filter(allowed);
      options.innerHTML=features.map(function(f){return '<button class="baa-guide-option" type="button" data-guide-id="'+esc(f.id)+'" role="listitem"><span class="baa-guide-option-icon" aria-hidden="true">'+esc(f.icon)+'</span><span><strong>'+esc(f.title)+'</strong><small>'+esc(f.description)+'</small></span><span class="baa-guide-arrow" aria-hidden="true">›</span></button>';}).join('');
      if(!features.length) options.innerHTML='<p class="baa-guide-empty">No role-specific features are available yet. Sign in to see your workspace guide.</p>';
      options.querySelectorAll('[data-guide-id]').forEach(function(el){el.addEventListener('click',function(){explain(el.dataset.guideId);});});
      status.textContent=role?'Showing features available to your '+role+' workspace.':'Showing the general BAA feature guide. Sign in for role-specific guidance.';
    }
    function explain(id){
      const f=C.getFeature(id);if(!f||!allowed(f)) return;
      answer.hidden=false;answer.innerHTML='<div class="baa-guide-answer-title">'+esc(f.icon)+' '+esc(f.title)+'</div><p>'+esc(f.description)+'</p><a class="baa-guide-go" href="'+esc(f.route)+'">Open '+esc(f.title)+' <span aria-hidden="true">→</span></a>';
      answer.focus&&answer.focus();
    }
    function open(){panel.hidden=false;button.setAttribute('aria-expanded','true');root.classList.add('is-open');render();const first=options.querySelector('[data-guide-id]');if(first)first.focus();}
    function shut(){panel.hidden=true;button.setAttribute('aria-expanded','false');root.classList.remove('is-open');button.focus();}
    button.addEventListener('click',function(){panel.hidden?open():shut();});close.addEventListener('click',shut);
    root.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden)shut();});
    document.addEventListener('click',function(e){if(!root.contains(e.target)&&!panel.hidden)shut();});
    detectRole().then(function(){if(!panel.hidden)render();});
    const here=C.getFeatures().find(function(f){return f.route===currentPath();});
    if(here) button.title='Guide for '+here.title;
  }
  function init(){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
  global.BAAGuideRobot={init:init,open:function(){const b=document.getElementById('baaGuideRobotButton');if(b&&!document.getElementById('baaGuideRobotPanel').hidden)b.click();else if(b)b.click();},getCurrentRole:function(){return role;},getFeatures:function(){return C.getFeatures();}};
  init();
})(window);
