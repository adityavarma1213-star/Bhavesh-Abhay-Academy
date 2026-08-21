/* BAA UI wiring checkpoint: M21, M22, M23, M33.
   Existing module logic is untouched. This file only connects real UI controls
   to those modules and renders their returned data without fabricating state. */
(function(global){
  'use strict';

  function el(id){ return document.getElementById(id); }
  function clear(node){ while(node && node.firstChild) node.removeChild(node.firstChild); }
  function text(node, value){ if(node) node.textContent = String(value == null ? '' : value); }

  function renderList(container, items, emptyMessage, formatter){
    clear(container);
    if(!items || !items.length){
      const p=document.createElement('p'); p.className='baa-ui-empty'; p.textContent=emptyMessage; container.appendChild(p); return;
    }
    const list=document.createElement('div'); list.className='baa-ui-results-list';
    items.forEach(item=>{
      const card=document.createElement('article'); card.className='baa-ui-result-item';
      formatter(item, card); list.appendChild(card);
    });
    container.appendChild(list);
  }

  function initPractice(){
    const btn=el('m21PracticeBtn'), limit=el('m21PracticeLimit'), out=el('m21PracticeResult');
    if(!btn||!limit||!out||!global.BAAPractice) return false;
    btn.addEventListener('click', function(){
      const n=Math.max(1, Math.min(20, Number(limit.value)||5));
      const questions=global.BAAPractice.getPracticeSet(n);
      renderList(out, questions, 'No practice questions are available in the current question bank.', function(q,card){
        const title=document.createElement('strong'); title.textContent=q.title || q.prompt || q.id || 'Practice question';
        const meta=document.createElement('div'); meta.className='baa-ui-meta'; meta.textContent=`${q.subject || 'Subject not specified'} · ${q.concept || 'Concept not specified'}`;
        card.append(title,meta);
      });
      const note=document.createElement('p'); note.className='baa-ui-meta'; note.textContent='Practice selection is driven by the existing question bank; weak concepts are prioritized when real assessment evidence exists.'; out.prepend(note);
    });
    return true;
  }

  function initEvidence(){
    const weakBtn=el('m22WeaknessBtn'), strongBtn=el('m23StrengthBtn'), weakOut=el('m22Result'), strongOut=el('m23Result');
    if(!weakBtn||!strongBtn||!weakOut||!strongOut||!global.BAAWeakness||!global.BAAStrength) return false;
    weakBtn.addEventListener('click', function(){
      const items=global.BAAWeakness.getWeaknesses();
      renderList(weakOut, items, 'Not enough evidence yet. Complete assessments so BAA can identify repeated weakness patterns.', function(x,card){
        const title=document.createElement('strong'); title.textContent=`${x.subject || 'Subject'} — ${x.concept || 'Concept'}`;
        const meta=document.createElement('div'); meta.className='baa-ui-meta'; meta.textContent=`${x.correctCount}/${x.evidenceCount} correct · ${x.status}`;
        const reason=document.createElement('p'); reason.textContent=x.reason || '';
        card.append(title,meta,reason);
      });
    });
    strongBtn.addEventListener('click', function(){
      const items=global.BAAStrength.getStrengths();
      renderList(strongOut, items, 'Not enough evidence yet. Complete assessments so BAA can identify evidence-backed strengths.', function(x,card){
        const title=document.createElement('strong'); title.textContent=`${x.subject || 'Subject'} — ${x.concept || 'Concept'}`;
        const meta=document.createElement('div'); meta.className='baa-ui-meta'; meta.textContent=`${x.correctCount}/${x.evidenceCount} correct · ${x.status}`;
        const reason=document.createElement('p'); reason.textContent=x.reason || '';
        card.append(title,meta,reason);
      });
    });
    return true;
  }

  const labFields={
    projectile:[['velocity','Velocity (m/s)','number','0.1'],['angle','Angle (degrees)','number','1']],
    ohm:[['voltage','Voltage (V)','number','0.1'],['resistance','Resistance (Ω)','number','0.1']],
    quadratic:[['a','a','number','0.1'],['b','b','number','0.1'],['c','c','number','0.1']]
  };

  function renderLabForm(){
    const select=el('m33LabSelect'), form=el('m33LabInputs'), out=el('m33LabResult');
    if(!select||!form||!global.BAALabs) return false;
    clear(form); clear(out);
    const id=select.value, fields=labFields[id]||[];
    fields.forEach(([name,label,type,step])=>{
      const wrap=document.createElement('label'); wrap.className='baa-ui-field';
      const span=document.createElement('span'); span.textContent=label;
      const input=document.createElement('input'); input.id=`m33-${name}`; input.name=name; input.type=type; input.step=step; input.required=true;
      wrap.append(span,input); form.appendChild(wrap);
    });
  }

  function initLabs(){
    const select=el('m33LabSelect'), runBtn=el('m33RunLabBtn'), form=el('m33LabInputs'), out=el('m33LabResult');
    if(!select||!runBtn||!form||!out||!global.BAALabs) return false;
    select.addEventListener('change', renderLabForm);
    runBtn.addEventListener('click', function(){
      const id=select.value, inputs=labFields[id]||[]; const data={};
      inputs.forEach(([name])=>{ const input=el(`m33-${name}`); data[name]=input ? input.value : ''; });
      const result=global.BAALabs.run(id,data);
      clear(out);
      const box=document.createElement('div'); box.className='baa-ui-result-box';
      if(!result.ok){ box.textContent=`Lab could not run: ${result.error || 'INVALID_INPUT'}`; out.appendChild(box); return; }
      const title=document.createElement('strong'); title.textContent='Simulation result'; box.appendChild(title);
      Object.entries(result.result||{}).forEach(([key,value])=>{
        const row=document.createElement('div'); row.className='baa-ui-result-row'; row.textContent=`${key}: ${value}`; box.appendChild(row);
      });
      out.appendChild(box);
    });
    renderLabForm();
    return true;
  }

  function initLiveDashboard(){
    const root=location.pathname.endsWith('student-os.html') || document.querySelector('.baa-dashboard');
    if(!root) return;

    const setAll=(selector,value)=>document.querySelectorAll(selector).forEach(n=>{ n.textContent=String(value); });
    const setNote=(statIndex,value)=>{ const stat=document.querySelectorAll('.baa-stat')[statIndex]; const note=stat?.querySelector('.s-note'); if(note) note.textContent=value; };
    const setStat=(index,value,note,progress)=>{
      const stat=document.querySelectorAll('.baa-stat')[index]; if(!stat) return;
      const v=stat.querySelector('.s-value'); if(v) v.textContent=String(value);
      const n=stat.querySelector('.s-note'); if(n && note!=null) n.textContent=String(note);
      const p=stat.querySelector('.baa-progress span'); if(p && progress!=null) p.style.width=`${Math.max(0,Math.min(100,progress))}%`;
    };

    async function getJson(url){
      const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});
      if(!r.ok) throw new Error(`HTTP_${r.status}`);
      return r.json();
    }

    async function hydrate(){
      try{
        const me=await getJson('/api/v1/my-learners');
        const learner=Array.isArray(me.learners)?me.learners[0]:null;
        if(!learner?.id) return;
        const [overview,planner,rewards]=await Promise.all([
          getJson(`/api/v1/learner-overview?learnerId=${encodeURIComponent(learner.id)}`),
          getJson(`/api/v1/planner?learnerId=${encodeURIComponent(learner.id)}`),
          getJson(`/api/v1/rewards?learnerId=${encodeURIComponent(learner.id)}`)
        ]);
        const snap=overview.snapshot||{};
        const r=snap.rewards||rewards.rewards||{};
        const attempts=snap.assessments||{};
        const xp=Number(r.xp||0);
        const maxScore=Number(attempts.max_score||0);
        const score=Number(attempts.score||0);
        const learning=maxScore>0 ? Math.round(score/maxScore*100) : null;
        const name=snap.learner?.display_name || learner.display_name || 'Student';
        text(el('dashboardName'),name);
        text(el('avatarInitial'),name.charAt(0).toUpperCase());
        setAll('.tb-right .pill.xp .lbl',`${xp.toLocaleString()} XP`);
        setStat(0,xp.toLocaleString(),'Server-derived from recorded BAA activity',Math.min(100,(xp%500)/5));
        setStat(1,'—','Level is not stored server-side yet',null);
        setStat(2,'—','Streak tracking is not enabled server-side yet',null);
        setStat(3,'—','Ranking service is not enabled yet',null);
        setStat(4,learning==null?'—':`${learning}%`,learning==null?'Complete an assessment to build evidence.':'Based on submitted assessment scores',learning==null?0:learning);

        const plan=planner.snapshot||{};
        const tasks=Array.isArray(plan.tasks)?plan.tasks:[];
        const pending=tasks.filter(t=>t.status==='pending'||t.status==='missed');
        const planHead=document.querySelector('.baa-learning h3');
        const planDesc=document.querySelector('.baa-learning p');
        const planScore=document.querySelector('.baa-score');
        const planProgress=document.querySelector('.baa-learning .baa-progress span');
        const planRemaining=document.querySelector('.baa-card .baa-card-head span');
        if(planRemaining) planRemaining.textContent=`${pending.length} task${pending.length===1?'':'s'} remaining`;
        if(pending[0]){
          if(planHead) planHead.textContent=pending[0].title||'Next learning task';
          if(planDesc) planDesc.textContent=`${pending[0].subject||'Learning'}${pending[0].concept?' · '+pending[0].concept:''} · evidence-based planner task`;
        }else if(planHead){
          planHead.textContent='No pending learning task';
          if(planDesc) planDesc.textContent='Complete an assessment or add a goal/upcoming assessment in Planner to generate work.';
        }
        if(planScore) planScore.textContent=learning==null?'—':`${learning}%`;
        if(planProgress) planProgress.style.width=`${learning==null?0:learning}%`;

        // Remove misleading hard-coded leaderboard/challenge claims when no live service exists.
        const rankRows=document.querySelectorAll('.baa-side-card .baa-rank-row');
        rankRows.forEach(row=>{ row.innerHTML='<span class="baa-rank-num">—</span><strong>Live ranking unavailable</strong><span class="baa-rank-xp">Not configured</span>'; });
        const challenge=document.querySelector('.baa-challenge-banner');
        if(challenge){ const small=challenge.querySelector('small'); const strong=challenge.querySelector('strong'); if(strong) strong.textContent='Assessment-based challenge'; if(small) small.textContent='Challenge battles are not enabled until a live challenge service is configured.'; }
        const ai=document.querySelectorAll('.baa-side-card');
        const rec=ai[2]?.querySelector('p');
        if(rec) rec.textContent=pending[0]?`Next evidence-based task: ${pending[0].title}. Open Planner to start it.`:'No recommendation yet — complete an assessment to give BAA real learning evidence.';
      }catch(_){
        // Do not invent values when authentication/database is unavailable.
        setStat(0,'—','Live data unavailable',0); setStat(1,'—','Live data unavailable',0); setStat(2,'—','Live data unavailable',0); setStat(3,'—','Live data unavailable',0); setStat(4,'—','Live data unavailable',0);
      }
    }

    // Make prototype-only worlds point to the real capabilities that already exist.
    const originalOpen=global.openWorld;
    if(typeof originalOpen==='function' && !originalOpen.__baaLiveWrapped){
      const wrapped=function(name){
        if(name==='quiz'){
          global.location.href='assessment.html';
          return;
        }
        if(name==='lab'){
          const tools=el('virtualLabsToolsSection');
          if(tools){ tools.scrollIntoView({behavior:'smooth',block:'start'}); return; }
        }
        originalOpen(name);
      };
      wrapped.__baaLiveWrapped=true;
      global.openWorld=wrapped;
    }

    hydrate();
    setInterval(hydrate,60000);
  }

  function init(){
    return {m21:initPractice(),m22m23:initEvidence(),m33:initLabs()};
  }
  global.BAAStudentWiringM21M23M33={init};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initLiveDashboard,{once:true});
  else setTimeout(initLiveDashboard,0);
})(window);
