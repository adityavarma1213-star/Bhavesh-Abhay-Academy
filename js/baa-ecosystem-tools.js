/* BAA Ecosystem Tools — real interactive UI for M34, M35, M38, M40, M44,
   M47, M48, M49, M50.
   Prior to this file, student-os.html rendered these nine modules as a
   static name+description card with no way to actually use the module.
   This file gives each one a genuine small working tool that calls the
   module's real function (BAASchool, BAACommunity, BAAExplainability,
   BAACurriculum, BAACareerPrep, BAAInstitution, BAAGlobalCollab,
   BAAOlympiad, BAAPlugins) and shows the module's real return value.
   No data is fabricated: where a module has no source of real data
   (e.g. Institution Analytics has no live attendance feed), the tool
   asks the person to enter the records by hand and says so.
   In-memory state (this session only) is used for modules whose own
   JS file does not persist to localStorage; School/Community/Curriculum
   already persist via their own module, and this file keeps using
   that same persisted state rather than duplicating storage. */
(function(){
  'use strict';

  function el(tag,attrs,children){
    const n=document.createElement(tag);
    if(attrs)Object.entries(attrs).forEach(function(e){
      if(e[0]==='text')n.textContent=e[1];
      else if(e[0]==='html')n.innerHTML=e[1];
      else n.setAttribute(e[0],e[1]);
    });
    (children||[]).forEach(function(c){if(c)n.appendChild(c);});
    return n;
  }
  function field(labelText,inputAttrs,id){
    const wrap=el('div',{class:'baa-eco-field'});
    wrap.appendChild(el('label',{for:id,class:'baa-eco-label'},[document.createTextNode(labelText)]));
    const input=el(inputAttrs.tag||'input',Object.assign({id:id,class:'baa-eco-input'},inputAttrs));
    input.removeAttribute('tag');
    wrap.appendChild(input);
    return {wrap:wrap,input:input};
  }
  function statusBox(){return el('div',{class:'baa-eco-note','role':'status','aria-live':'polite',style:'margin-top:8px;min-height:18px;'});}
  function toolCard(id,title,desc){
    const card=el('div',{class:'baa-ecotool',style:'grid-column:1/-1;'});
    card.appendChild(el('b',{},[document.createTextNode(id+' '+title)]));
    card.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode(desc)]));
    return card;
  }

  /* ---- M34 School Portal ---- */
  function buildSchool(){
    if(typeof window.BAASchool==='undefined')return null;
    const card=toolCard('M34','🏫 School Portal','Local roster, attendance and announcements — saved on this device.');
    const nameF=field('Student name',{placeholder:'e.g. Aditi Rao'},'schoolStudentName');
    const clsF=field('Class',{placeholder:'e.g. 9'},'schoolStudentClass');
    const secF=field('Section',{placeholder:'e.g. A'},'schoolStudentSection');
    const addBtn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Add student')]);
    const status=statusBox();
    const list=el('div',{style:'margin-top:10px;'});
    function refresh(){
      const s=window.BAASchool.getState().state;
      list.replaceChildren();
      if(!s.students.length){list.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('No students added yet on this device.')]));return;}
      s.students.forEach(function(stu){
        const row=el('div',{style:'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;'});
        row.appendChild(el('span',{},[document.createTextNode(stu.name+' — Class '+(stu.className||'—')+(stu.section?' '+stu.section:''))]));
        const presentBtn=el('button',{class:'baa-eco-btn baa-eco-btn-ghost',type:'button','aria-label':'Mark '+stu.name+' present today'},[document.createTextNode('Mark present today')]);
        const absentBtn=el('button',{class:'baa-eco-btn baa-eco-btn-ghost',type:'button','aria-label':'Mark '+stu.name+' absent today'},[document.createTextNode('Mark absent today')]);
        presentBtn.onclick=function(){window.BAASchool.markAttendance(stu.id,new Date().toISOString().slice(0,10),'present');status.textContent='Marked '+stu.name+' present today.';refresh();};
        absentBtn.onclick=function(){window.BAASchool.markAttendance(stu.id,new Date().toISOString().slice(0,10),'absent');status.textContent='Marked '+stu.name+' absent today.';refresh();};
        row.appendChild(presentBtn);row.appendChild(absentBtn);
        list.appendChild(row);
      });
    }
    addBtn.onclick=function(){
      const r=window.BAASchool.addStudent({name:nameF.input.value,className:clsF.input.value,section:secF.input.value});
      if(r.ok){status.textContent='Added '+nameF.input.value+'.';nameF.input.value='';clsF.input.value='';secF.input.value='';refresh();}
      else status.textContent='Could not add student: '+r.error;
    };
    const annF=field('Announcement',{tag:'textarea',rows:2,placeholder:'e.g. PTM on Friday 5pm'},'schoolAnnouncement');
    const annBtn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Post announcement')]);
    const annList=el('div',{style:'margin-top:8px;'});
    function refreshAnn(){
      const s=window.BAASchool.getState().state;
      annList.replaceChildren();
      s.announcements.slice(-5).reverse().forEach(function(a){annList.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('📣 '+a.text)]));});
    }
    annBtn.onclick=function(){
      const r=window.BAASchool.addAnnouncement(annF.input.value);
      if(r.ok){status.textContent='Announcement posted.';annF.input.value='';refreshAnn();}
      else status.textContent='Could not post: '+r.error;
    };
    card.appendChild(nameF.wrap);card.appendChild(clsF.wrap);card.appendChild(secF.wrap);card.appendChild(addBtn);
    card.appendChild(status);card.appendChild(el('div',{style:'font-weight:600;font-size:.8rem;margin-top:10px;'},[document.createTextNode('Roster & attendance')]));card.appendChild(list);
    card.appendChild(el('div',{style:'font-weight:600;font-size:.8rem;margin-top:10px;'},[document.createTextNode('Announcements')]));card.appendChild(annF.wrap);card.appendChild(annBtn);card.appendChild(annList);
    refresh();refreshAnn();
    return card;
  }

  /* ---- M35 Community ---- */
  function buildCommunity(){
    if(typeof window.BAACommunity==='undefined')return null;
    const card=toolCard('M35','🌟 Community','Moderated local study posts — visible only on this device/session.');
    const textF=field('Share something with your study group',{tag:'textarea',rows:2,placeholder:'e.g. Anyone free to revise Trigonometry tonight?'},'communityPostText');
    const btn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Post')]);
    const status=statusBox();
    const list=el('div',{style:'margin-top:8px;'});
    function refresh(){
      const posts=window.BAACommunity.listPosts().posts;
      list.replaceChildren();
      if(!posts.length){list.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('No posts yet.')]));return;}
      posts.slice(-8).reverse().forEach(function(p){list.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('💬 '+p.text)]));});
    }
    btn.onclick=function(){
      const r=window.BAACommunity.createPost(textF.input.value,'general');
      if(r.ok){status.textContent='Posted.';textF.input.value='';refresh();}
      else status.textContent='Not posted — '+(r.error==='POST_BLOCKED_BY_SAFETY_FILTER'?'this content was blocked by the safety filter.':r.error);
    };
    card.appendChild(textF.wrap);card.appendChild(btn);card.appendChild(status);card.appendChild(list);
    refresh();
    return card;
  }

  /* ---- M38 Explainable AI ---- */
  function buildExplainability(){
    if(typeof window.BAAExplainability==='undefined')return null;
    const card=toolCard('M38','🧠 Explainable AI','See exactly what evidence a BAA number is built from — never a hidden model claim.');
    const btn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Explain my current weekly summary')]);
    const out=el('div',{style:'margin-top:8px;'});
    btn.onclick=function(){
      out.replaceChildren();
      let metric=null;
      if(typeof window.BAAInsights!=='undefined'){
        const r=window.BAAInsights.build();
        if(r.ok && r.evidenceQuality!=='insufficient_evidence'){
          metric={evidenceCount:r.metrics.answeredQuestions,correctCount:r.metrics.answeredQuestions&&r.metrics.accuracyPercent!=null?Math.round(r.metrics.answeredQuestions*r.metrics.accuracyPercent/100):null,state:r.evidenceQuality,source:'BAAInsights weekly summary'};
        }
      }
      if(!metric){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Not enough recorded activity yet to explain — complete an assessment first.')]));return;}
      const r=window.BAAExplainability.explain(metric);
      if(!r.ok){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Could not build an explanation.')]));return;}
      r.reasons.forEach(function(reason){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('• '+reason)]));});
      out.appendChild(el('div',{class:'baa-eco-note',style:'font-style:italic;margin-top:4px;'},[document.createTextNode(r.limitation)]));
    };
    card.appendChild(btn);card.appendChild(out);
    return card;
  }

  /* ---- M40 Curriculum ---- */
  function buildCurriculum(){
    if(typeof window.BAACurriculum==='undefined')return null;
    const card=toolCard('M40','📚 Curriculum & Board','Set your board/class/subject and store your own topic-to-concept mappings.');
    const g=window.BAACurriculum.get();
    const boardF=field('Board',{tag:'select'},'curriculumBoard');
    g.boards.forEach(function(b){boardF.input.appendChild(el('option',{value:b.id},[document.createTextNode(b.label)]));});
    const classF=field('Class',{placeholder:'e.g. 9'},'curriculumClass');
    const subjF=field('Subject',{placeholder:'e.g. Mathematics'},'curriculumSubject');
    const saveBtn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Save profile')]);
    const status=statusBox();
    const profileOut=el('div',{class:'baa-eco-note',style:'margin-top:6px;'});
    function refreshProfile(){
      const s=window.BAACurriculum.get().state;
      profileOut.textContent=s.board?('Current profile: '+s.board+' · Class '+s.className+' · '+s.subject):'No profile saved yet.';
    }
    saveBtn.onclick=function(){
      const r=window.BAACurriculum.setProfile(boardF.input.value,classF.input.value,subjF.input.value);
      if(r.ok){status.textContent='Profile saved.';refreshProfile();}
      else status.textContent='Could not save: '+r.error;
    };
    const topicF=field('Topic',{placeholder:'e.g. Linear Equations'},'curriculumTopic');
    const conceptF=field('Concept it maps to',{placeholder:'e.g. Solving for x'},'curriculumConcept');
    const mapBtn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Add mapping')]);
    const mapList=el('div',{style:'margin-top:6px;'});
    function refreshMappings(){
      const s=window.BAACurriculum.get().state;
      mapList.replaceChildren();
      s.mappings.slice(-6).reverse().forEach(function(m){mapList.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode(m.topic+' → '+m.concept)]));});
    }
    mapBtn.onclick=function(){
      const r=window.BAACurriculum.addMapping(topicF.input.value,conceptF.input.value);
      if(r.ok){status.textContent='Mapping added.';topicF.input.value='';conceptF.input.value='';refreshMappings();}
      else status.textContent='Could not add mapping: '+r.error;
    };
    card.appendChild(boardF.wrap);card.appendChild(classF.wrap);card.appendChild(subjF.wrap);card.appendChild(saveBtn);card.appendChild(status);card.appendChild(profileOut);
    card.appendChild(el('div',{style:'font-weight:600;font-size:.8rem;margin-top:10px;'},[document.createTextNode('Your topic → concept map')]));
    card.appendChild(topicF.wrap);card.appendChild(conceptF.wrap);card.appendChild(mapBtn);card.appendChild(mapList);
    refreshProfile();refreshMappings();
    return card;
  }

  /* ---- M44 Career Prep ---- */
  function buildCareerPrep(){
    if(typeof window.BAACareerPrep==='undefined')return null;
    const card=toolCard('M44','💼 Career Prep','Skill-gap check between what you have and a target role — no invented job outcomes.');
    const goalF=field('Career goal',{placeholder:'e.g. Data Analyst'},'careerGoal');
    const skillsF=field('Your current skills (comma-separated)',{placeholder:'e.g. Excel, Python basics'},'careerSkills');
    const targetF=field('Target skills for this goal (comma-separated)',{placeholder:'e.g. Python, SQL, Statistics, Excel'},'careerTarget');
    const btn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Check skill gap')]);
    const out=el('div',{style:'margin-top:8px;'});
    btn.onclick=function(){
      out.replaceChildren();
      const p=window.BAACareerPrep.profile({goal:goalF.input.value,skills:skillsF.input.value.split(',')});
      if(!p.ok){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Could not build profile.')]));return;}
      const g=window.BAACareerPrep.gap(p.profile,targetF.input.value.split(',').map(function(s){return s.trim();}).filter(Boolean));
      if(!g.ok){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Could not compute gap.')]));return;}
      out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode(g.missing.length?('Skills to work on for '+ (p.profile.goal||'this goal') +': '+g.missing.join(', ')):'No gap found against the skills you listed.')]));
    };
    card.appendChild(goalF.wrap);card.appendChild(skillsF.wrap);card.appendChild(targetF.wrap);card.appendChild(btn);card.appendChild(out);
    return card;
  }

  /* ---- M47 Institution Analytics ---- */
  function buildInstitution(){
    if(typeof window.BAAInstitution==='undefined')return null;
    const card=toolCard('M47','📊 Institution Analytics','Enter records by hand to see aggregate rates — no live school feed exists yet, so nothing is invented.');
    const rows=[];
    const rowsHost=el('div',{style:'margin-top:6px;'});
    const out=el('div',{style:'margin-top:8px;'});
    function renderRows(){
      rowsHost.replaceChildren();
      rows.forEach(function(r,i){
        rowsHost.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Record '+(i+1)+': attendance='+r.attendance+', assignment completed='+r.assignmentCompleted)]));
      });
    }
    const presentBtn=el('button',{class:'baa-eco-btn baa-eco-btn-ghost',type:'button'},[document.createTextNode('+ Present, assignment done')]);
    const presentNoBtn=el('button',{class:'baa-eco-btn baa-eco-btn-ghost',type:'button'},[document.createTextNode('+ Present, assignment not done')]);
    const absentBtn=el('button',{class:'baa-eco-btn baa-eco-btn-ghost',type:'button'},[document.createTextNode('+ Absent')]);
    presentBtn.onclick=function(){rows.push({attendance:'present',assignmentCompleted:true});renderRows();};
    presentNoBtn.onclick=function(){rows.push({attendance:'present',assignmentCompleted:false});renderRows();};
    absentBtn.onclick=function(){rows.push({attendance:'absent',assignmentCompleted:false});renderRows();};
    const calcBtn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Calculate rates')]);
    calcBtn.onclick=function(){
      const r=window.BAAInstitution.summarize(rows);
      out.replaceChildren();
      if(!r.ok){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Could not summarize.')]));return;}
      if(r.evidenceQuality==='insufficient_evidence'){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Add at least one record first.')]));return;}
      out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode(r.metrics.students+' record(s) · Attendance '+r.metrics.presenceRate+'% · Assignment completion '+r.metrics.assignmentCompletionRate+'%')]));
    };
    card.appendChild(el('div',{style:'display:flex;gap:6px;flex-wrap:wrap;'},[presentBtn,presentNoBtn,absentBtn]));
    card.appendChild(rowsHost);card.appendChild(calcBtn);card.appendChild(out);
    return card;
  }

  /* ---- M48 Global Collaboration ---- */
  function buildGlobalCollab(){
    if(typeof window.BAAGlobalCollab==='undefined')return null;
    const card=toolCard('M48','🌍 Global Collaboration','Draft a cross-school project object — production identity/moderation is not part of this local build.');
    const titleF=field('Project title',{placeholder:'e.g. Water Conservation Study'},'collabTitle');
    const regionF=field('Region',{placeholder:'e.g. Maharashtra, India'},'collabRegion');
    const createBtn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Create project draft')]);
    const status=statusBox();
    const out=el('div',{style:'margin-top:8px;'});
    let current=null;
    createBtn.onclick=function(){
      const r=window.BAAGlobalCollab.validateProject({title:titleF.input.value,region:regionF.input.value});
      if(!r.ok){status.textContent='Could not create: '+r.error;return;}
      current=r.project;status.textContent='Draft created.';
      out.replaceChildren();
      out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('"'+current.title+'" ('+current.region+') — status: '+current.status+', '+current.participants.length+' participant(s).')]));
    };
    const nameF=field('Your display name',{placeholder:'e.g. Rohan'},'collabName');
    const joinBtn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Join this project')]);
    joinBtn.onclick=function(){
      if(!current){status.textContent='Create a project draft first.';return;}
      const r=window.BAAGlobalCollab.join(current,{id:'p_'+Date.now(),displayName:nameF.input.value});
      if(!r.ok){status.textContent='Could not join: '+r.error;return;}
      current=r.project;status.textContent='Joined.';
      out.replaceChildren();
      out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('"'+current.title+'" ('+current.region+') — status: '+current.status+', '+current.participants.length+' participant(s).')]));
    };
    card.appendChild(titleF.wrap);card.appendChild(regionF.wrap);card.appendChild(createBtn);
    card.appendChild(nameF.wrap);card.appendChild(joinBtn);
    card.appendChild(status);card.appendChild(out);
    return card;
  }

  /* ---- M49 Olympiad ---- */
  function buildOlympiad(){
    if(typeof window.BAAOlympiad==='undefined')return null;
    const card=toolCard('M49','🏆 Olympiad Practice','A deterministic day-by-day practice rotation from topics you supply — no invented contest dates.');
    const topicsF=field('Topics (comma-separated)',{placeholder:'e.g. Number Theory, Combinatorics, Geometry'},'olympiadTopics');
    const daysF=field('Number of days',{type:'number',min:'1',max:'365',value:'7'},'olympiadDays');
    const btn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Build plan')]);
    const out=el('div',{style:'margin-top:8px;'});
    btn.onclick=function(){
      out.replaceChildren();
      const topics=topicsF.input.value.split(',').map(function(s){return s.trim();}).filter(Boolean);
      const r=window.BAAOlympiad.buildPlan(topics,parseInt(daysF.input.value,10));
      if(!r.ok){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Could not build plan: '+r.error)]));return;}
      r.plan.forEach(function(d){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Day '+d.day+': '+d.topic+' ('+d.focus+')')]));});
    };
    card.appendChild(topicsF.wrap);card.appendChild(daysF.wrap);card.appendChild(btn);card.appendChild(out);
    return card;
  }

  /* ---- M50 Plugins ---- */
  function buildPlugins(){
    if(typeof window.BAAPlugins==='undefined')return null;
    const card=toolCard('M50','🧩 Plugin Marketplace','Validate a plugin manifest — this never executes plugin code, only checks the manifest shape.');
    const idF=field('Plugin ID',{placeholder:'e.g. flashcard-sync'},'pluginId');
    const nameF=field('Plugin name',{placeholder:'e.g. Flashcard Sync'},'pluginName');
    const entryF=field('Entry URL (https only)',{placeholder:'https://example.com/plugin.json'},'pluginEntry');
    const permsWrap=el('div',{style:'margin-bottom:8px;'});
    permsWrap.appendChild(el('div',{style:'font-size:.78rem;font-weight:600;margin-bottom:4px;'},[document.createTextNode('Requested permissions')]));
    const perms=window.BAAPlugins.permissions();
    const checks=perms.map(function(p){
      const id='pluginPerm_'+p;
      const wrap=el('label',{style:'display:inline-flex;align-items:center;gap:5px;margin:0 10px 4px 0;font-size:.78rem;'});
      const cb=el('input',{type:'checkbox',id:id,value:p});
      wrap.appendChild(cb);wrap.appendChild(document.createTextNode(p));
      permsWrap.appendChild(wrap);
      return cb;
    });
    const btn=el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode('Validate manifest')]);
    const out=el('div',{style:'margin-top:8px;'});
    btn.onclick=function(){
      out.replaceChildren();
      const permissions=checks.filter(function(c){return c.checked;}).map(function(c){return c.value;});
      const r=window.BAAPlugins.validateManifest({id:idF.input.value,name:nameF.input.value,permissions:permissions,entry:entryF.input.value});
      if(!r.ok){out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Rejected: '+r.error)]));return;}
      out.appendChild(el('div',{class:'baa-eco-note'},[document.createTextNode('Valid manifest for "'+r.manifest.name+'" — permissions: '+(r.manifest.permissions.join(', ')||'none')+'.')]));
    };
    card.appendChild(idF.wrap);card.appendChild(nameF.wrap);card.appendChild(entryF.wrap);card.appendChild(permsWrap);card.appendChild(btn);card.appendChild(out);
    return card;
  }

  window.BAAEcosystemTools={
    /* Student OS — Progress/Ecosystem workspace */
    ecosystem:function(){return [buildExplainability(),buildCurriculum()].filter(Boolean);},
    /* Student OS — Progress/Expansion workspace */
    expansion:function(){return [buildGlobalCollab(),buildOlympiad()].filter(Boolean);},
    /* Student OS — dedicated Community world overlay */
    community:function(){return buildCommunity();},
    /* Student OS — dedicated Career world overlay */
    careerPrep:function(){return buildCareerPrep();},
    /* Admin/Governance page — these are institution/admin-role actions,
       not student actions, so they are deliberately NOT mounted on the
       student dashboard. */
    school:function(){return buildSchool();},
    institution:function(){return buildInstitution();},
    plugins:function(){return buildPlugins();}
  };
})();
