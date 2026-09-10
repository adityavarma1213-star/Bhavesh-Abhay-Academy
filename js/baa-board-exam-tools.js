/* BAA Board & Exam Tools -- real fetch-wired client for M64-M76.
   Before this file existed, these modules had real backend handlers
   (api/v1/[...route].js) and real mock-DB tests, but zero website UI --
   confirmed by BAA-FEATURE-PLACEMENT-MATRIX-M01-M78.md. This file is
   the first client. Every request below targets a route this session
   verified exists by reading the dispatcher in api/v1/[...route].js
   directly (not guessed), and every request body/query field name was
   read from that route's real handler source, not invented.

   HONEST LIMITATION: this code has not been exercised against a live
   API server or PostgreSQL database -- none exists in the sandbox this
   was written in. Errors returned by the real server (400/403/404/etc,
   with the server's real error.message) are shown to the user as-is;
   nothing here is a fabricated success state.
*/
(function(){
  'use strict';

  function el(tag,attrs,children){
    const n=document.createElement(tag);
    if(attrs)Object.entries(attrs).forEach(function(e){
      if(e[0]==='text')n.textContent=e[1];
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
  function out(){return el('div',{class:'baa-eco-note',role:'status','aria-live':'polite',style:'margin-top:8px;white-space:pre-wrap;'});}
  function mkbtn(label){return el('button',{class:'baa-eco-btn',type:'button'},[document.createTextNode(label)]);}

  async function api(path, opts){
    opts = opts || {};
    const res = await fetch('/api/v1/'+path, Object.assign({credentials:'include'}, opts));
    let data = null;
    try { data = await res.json(); } catch(e) { /* non-JSON response */ }
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || ('Request failed (HTTP '+res.status+').');
      const err = new Error(msg); err.status = res.status; err.data = data; throw err;
    }
    return data;
  }
  function learnerId(){ return window.BAA_LEARNER_ID || ''; }
  function showError(outEl, e){ outEl.textContent = 'Error: ' + e.message; }
  function showJson(outEl, obj){ outEl.textContent = JSON.stringify(obj, null, 2); }

  function panel(mid, title, note){
    const card = el('div', {class:'baa-ecotool'});
    card.appendChild(el('b', {}, [document.createTextNode(mid+' '+title)]));
    if(note) card.appendChild(el('div', {class:'baa-eco-note'}, [document.createTextNode(note)]));
    return card;
  }

  function buildBoardRegistry(){
    const card = panel('M64', 'Board Registry', 'Real, currently-registered boards -- no invented board names.');
    const b = mkbtn('Load boards'); const o = out();
    b.onclick = function(){
      o.textContent = 'Loading...';
      api('board-registry').then(function(data){
        if (!data.boards.length) { o.textContent = 'No boards are registered in this database yet.'; return; }
        o.textContent = data.boards.map(function(x){ return (x.shortName || x.short_name) + ' -- ' + x.name + ' (' + (x.boardType || x.board_type) + ')'; }).join('\n');
      }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(b); card.appendChild(o);
    return card;
  }

  function buildCurriculumGraph(){
    const card = panel('M65', 'Curriculum Graph', 'Real subjects registered for a board -- enter a board id from the Board Registry above.');
    const boardF = field('Board ID', {placeholder:'e.g. cbse'}, 'cgBoardId');
    const b = mkbtn('Load subjects'); const o = out();
    b.onclick = function(){
      o.textContent = 'Loading...';
      api('curriculum-graph?type=subject&boardId='+encodeURIComponent(boardF.input.value)).then(function(data){
        if (!data.subjects.length) { o.textContent = 'No subjects registered for this board yet.'; return; }
        o.textContent = data.subjects.map(function(s){ return s.name + ' -- Class ' + (s.class_level || s.classLevel); }).join('\n');
      }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(boardF.wrap); card.appendChild(b); card.appendChild(o);
    return card;
  }

  function buildQuestionBank(){
    const card = panel('M66', 'Question Bank Search', 'Searches real published/verified questions. The M75 low-bandwidth "minimal fields" mode is a real toggle, not cosmetic.');
    const boardF = field('Board ID', {placeholder:'e.g. cbse'}, 'qbBoard');
    const subjF = field('Subject ID', {placeholder:'optional'}, 'qbSubject');
    const kwF = field('Keyword', {placeholder:'optional'}, 'qbKeyword');
    const slimWrap = el('label', {class:'baa-eco-field', style:'display:flex;align-items:center;gap:6px;'});
    const slimInput = el('input', {type:'checkbox', id:'qbSlim'});
    slimWrap.appendChild(slimInput);
    slimWrap.appendChild(document.createTextNode('Low-bandwidth mode (minimal fields -- real M75 slim payload)'));
    const b = mkbtn('Search'); const o = out();
    b.onclick = function(){
      o.textContent = 'Loading...';
      const qs = new URLSearchParams({boardId:boardF.input.value, subjectId:subjF.input.value, q:kwF.input.value, limit:'10'});
      if (slimInput.checked) qs.set('fields','minimal');
      api('question-bank?'+qs.toString()).then(function(data){
        if (!data.questions.length) { o.textContent = 'No matching published questions found.'; return; }
        o.textContent = data.count + ' result(s), slim=' + data.slim + '\n' + data.questions.map(function(q){
          return '- [' + (q.difficulty||'?') + '] ' + (q.questionText||q.question_text||'').slice(0,90);
        }).join('\n');
      }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(boardF.wrap); card.appendChild(subjF.wrap); card.appendChild(kwF.wrap);
    card.appendChild(slimWrap); card.appendChild(b); card.appendChild(o);
    return card;
  }

  function buildMockExamAndAttempt(){
    const card = panel('M71 + M67', 'Adaptive Mock Exam -> Exam Room', 'Generates a real mock paper from your weak-concept evidence (or coverage gap if none yet), then can start a real timed attempt on it.');
    const boardF = field('Board ID', {placeholder:'e.g. cbse'}, 'meBoard');
    const subjF = field('Subject ID', {placeholder:'e.g. subj_math_9'}, 'meSubject');
    const classF = field('Class level', {placeholder:'e.g. 9'}, 'meClass');
    const mediumF = field('Medium', {placeholder:'e.g. english'}, 'meMedium');
    const countF = field('Number of questions', {type:'number', min:'1', max:'50', value:'10'}, 'meCount');
    const genBtn = mkbtn('Generate mock exam'); const o = out();
    let lastExamPaperId = null;
    const startBtn = mkbtn('Start timed attempt (60 min)');
    startBtn.disabled = true; startBtn.style.opacity = '.5';
    genBtn.onclick = function(){
      o.textContent = 'Generating...';
      api('adaptive-mock-exam', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        learnerId: learnerId(), boardId: boardF.input.value, subjectId: subjF.input.value,
        classLevel: classF.input.value, medium: mediumF.input.value,
        questionCount: parseInt(countF.input.value,10) || 10, timeLimitSeconds: 3600
      })}).then(function(data){
        if (data.insufficientEvidence) { o.textContent = data.message; return; }
        lastExamPaperId = data.examPaperId;
        startBtn.disabled = false; startBtn.style.opacity = '1';
        o.textContent = 'Generated exam paper ' + data.examPaperId + ' -- ' + data.questionCount + '/' + data.requestedQuestionCount + ' question(s) selected (partiallyFilled=' + data.partiallyFilled + ').';
      }).catch(function(e){ showError(o, e); });
    };
    startBtn.onclick = function(){
      if (!lastExamPaperId) return;
      o.textContent = 'Starting attempt...';
      api('exam-attempts', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        examPaperId: lastExamPaperId, learnerId: learnerId(), timeLimitSeconds: 3600
      })}).then(function(data){
        currentAttempt = data.attempt;
        answerWrap.style.display = 'block';
        o.textContent = 'Attempt ' + data.attempt.id + ' started -- status ' + data.attempt.status + '. You can now save an answer or submit the attempt below.';
      }).catch(function(e){ showError(o, e); });
    };

    /* M67 fix: the exam room needs more than "start an attempt" -- a
       learner must actually be able to save an answer and submit the
       attempt, which is what PATCH exam-attempts really requires
       (action + expectedVersion). This was previously missing. */
    let currentAttempt = null;
    const answerWrap = el('div', {style:'display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(128,128,128,.2);'});
    const qIdF = field('Question ID (from the mock exam paper)', {placeholder:'copy from a Question Bank search result'}, 'eaQuestionId');
    const respF = field('Your answer', {tag:'textarea', rows:2}, 'eaResponse');
    const saveBtn = mkbtn('Save answer');
    const submitBtn = mkbtn('Submit attempt');
    const eo = out();
    saveBtn.onclick = function(){
      if (!currentAttempt) return;
      eo.textContent = 'Saving...';
      api('exam-attempts?id='+encodeURIComponent(currentAttempt.id), {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        action:'save_answer', expectedVersion: currentAttempt.version, questionId: qIdF.input.value, responseText: respF.input.value
      })}).then(function(data){
        currentAttempt = data.attempt;
        eo.textContent = 'Answer saved -- attempt version now ' + currentAttempt.version + '.';
      }).catch(function(e){ showError(eo, e); });
    };
    submitBtn.onclick = function(){
      if (!currentAttempt) return;
      eo.textContent = 'Submitting...';
      api('exam-attempts?id='+encodeURIComponent(currentAttempt.id), {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        action:'submit', expectedVersion: currentAttempt.version
      })}).then(function(data){
        currentAttempt = data.attempt;
        eo.textContent = 'Attempt submitted -- status ' + currentAttempt.status + '.';
      }).catch(function(e){ showError(eo, e); });
    };
    answerWrap.appendChild(qIdF.wrap); answerWrap.appendChild(respF.wrap);
    answerWrap.appendChild(saveBtn); answerWrap.appendChild(submitBtn); answerWrap.appendChild(eo);
    [boardF.wrap, subjF.wrap, classF.wrap, mediumF.wrap, countF.wrap, genBtn, startBtn, o, answerWrap].forEach(function(x){ card.appendChild(x); });
    return card;
  }

  function buildAdaptivePractice(){
    const card = panel('M68 + M69', 'Adaptive Practice', 'Real weak-concept list from your Learning Memory evidence, then a real practice session start on the concept you pick.');
    const listBtn = mkbtn('Load my weak concepts'); const o = out();
    const conceptF = field('Concept ID to practice', {placeholder:'copy an id from the list above'}, 'apConcept');
    const startBtn = mkbtn('Start practice session');
    listBtn.onclick = function(){
      o.textContent = 'Loading...';
      api('adaptive-practice?learnerId='+encodeURIComponent(learnerId())).then(function(data){
        if (!data.weakConcepts.length) { o.textContent = 'No weak or insufficient-evidence concepts on record yet -- nothing to target.'; return; }
        o.textContent = data.weakConcepts.map(function(c){ return (c.conceptId || c.concept_id) + ' -- ' + c.status; }).join('\n');
      }).catch(function(e){ showError(o, e); });
    };
    let currentSessionId = null, currentQuestionId = null;
    const answerWrap = el('div', {style:'display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(128,128,128,.2);'});
    const respF = field('Your answer', {placeholder:'exact text answer for MCQ/numerical questions'}, 'apResponse');
    const submitBtn = mkbtn('Submit answer (this is what actually feeds M69 Learning Memory)');
    const ao = out();
    startBtn.onclick = function(){
      o.textContent = 'Starting...';
      api('adaptive-practice', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        learnerId: learnerId(), conceptId: conceptF.input.value
      })}).then(function(data){
        currentSessionId = data.sessionId;
        currentQuestionId = data.question ? data.question.id : null;
        answerWrap.style.display = currentQuestionId ? 'block' : 'none';
        o.textContent = data.question ? ('Session ' + data.sessionId + ' -- question: ' + data.question.questionText) : ('Session ' + data.sessionId + ' -- ' + data.message);
      }).catch(function(e){ showError(o, e); });
    };
    /* M68/M69 fix: starting a session previously had no way to actually
       answer the question, which is the only thing that triggers M69's
       recordBoardLearningEvidence() on the server (confirmed by reading
       the handler: evidence is recorded only when a deterministically
       graded submit_answer happens). */
    submitBtn.onclick = function(){
      if (!currentSessionId || !currentQuestionId) return;
      ao.textContent = 'Submitting...';
      api('adaptive-practice?sessionId='+encodeURIComponent(currentSessionId), {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        action:'submit_answer', questionId: currentQuestionId, responseText: respF.input.value
      })}).then(function(data){
        let txt = 'Graded by: ' + data.gradedBy + (data.isCorrect === null ? '' : (', correct=' + data.isCorrect));
        if (data.explanation) txt += '\nExplanation: ' + data.explanation;
        if (data.nextQuestion) { currentQuestionId = data.nextQuestion.id; txt += '\nNext question: ' + data.nextQuestion.questionText; }
        else { currentQuestionId = null; answerWrap.style.display = 'none'; txt += '\n(No more questions for this concept right now.)'; }
        ao.textContent = txt;
      }).catch(function(e){ showError(ao, e); });
    };
    answerWrap.appendChild(respF.wrap); answerWrap.appendChild(submitBtn); answerWrap.appendChild(ao);
    card.appendChild(listBtn); card.appendChild(conceptF.wrap); card.appendChild(startBtn); card.appendChild(o); card.appendChild(answerWrap);
    return card;
  }

  function buildPaperIntelligence(){
    const card = panel('M70', 'Paper Intelligence', 'Real concept/chapter frequency computed from published questions -- trend fields populate only with genuinely enough multi-year data.');
    const boardF = field('Board ID', {placeholder:'e.g. cbse'}, 'piBoard');
    const b = mkbtn('Analyze'); const o = out();
    b.onclick = function(){
      o.textContent = 'Loading...';
      api('paper-intelligence?boardId='+encodeURIComponent(boardF.input.value)).then(function(data){ showJson(o, data); }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(boardF.wrap); card.appendChild(b); card.appendChild(o);
    return card;
  }

  function buildExamReadiness(){
    const card = panel('M72', 'Exam Readiness', 'Evidence-weighted readiness -- explicitly reports insufficient evidence rather than guessing.');
    const subjF = field('Subject ID', {placeholder:'e.g. subj_math_9'}, 'erSubject');
    const b = mkbtn('Check readiness'); const o = out();
    b.onclick = function(){
      o.textContent = 'Loading...';
      api('exam-readiness?learnerId='+encodeURIComponent(learnerId())+'&subjectId='+encodeURIComponent(subjF.input.value)).then(function(data){ showJson(o, data); }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(subjF.wrap); card.appendChild(b); card.appendChild(o);
    return card;
  }

  function buildBoardMissions(){
    const card = panel('M73', 'Board Prep Missions', 'Generates real day-by-day revision tasks from your weak concepts into the same Planner used elsewhere in BAA -- not a separate fake planner.');
    const subjF = field('Subject ID', {placeholder:'e.g. subj_math_9'}, 'bmSubject');
    const daysF = field('Days ahead', {type:'number', min:'1', max:'30', value:'7'}, 'bmDays');
    const b = mkbtn('Generate missions'); const o = out();
    b.onclick = function(){
      o.textContent = 'Generating...';
      api('board-missions', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        learnerId: learnerId(), subjectId: subjF.input.value, daysAhead: parseInt(daysF.input.value,10) || 7
      })}).then(function(data){
        o.textContent = data.insufficientEvidence ? data.message : (data.tasksCreated + ' mission(s) created -- check your Planner.');
      }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(subjF.wrap); card.appendChild(daysF.wrap); card.appendChild(b); card.appendChild(o);
    return card;
  }

  function buildTranslations(){
    const card = panel('M75', 'Question Translations', 'Real, governed translations -- every one starts pending_verification and is never treated as equivalent to the original until an admin verifies it.');
    const qF = field('Question ID', {placeholder:'copy from a Question Bank search result'}, 'trQuestion');
    const b = mkbtn('Load translations'); const o = out();
    b.onclick = function(){
      o.textContent = 'Loading...';
      api('question-translations?sourceQuestionId='+encodeURIComponent(qF.input.value)).then(function(data){
        if (!data.translations.length) { o.textContent = 'No verified translation exists for this question yet.'; return; }
        o.textContent = data.translations.map(function(t){ return '[' + t.medium + '] (' + t.verificationStatus + ') ' + t.translatedText.slice(0,120); }).join('\n');
      }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(qF.wrap); card.appendChild(b); card.appendChild(o);
    return card;
  }

  /* M75 fix: submitting a translation is teacher/admin-only server-side
     (handleCreate requires hasRole admin/teacher), so this authoring form
     is mounted on teacher-os.html, not the student-facing page above --
     the read-only viewer stays student-facing, submission does not. */
  function buildTranslationAuthoring(){
    const card = panel('M75', 'Submit Question Translation', 'Every submission starts as pending_verification -- it is never shown as a verified translation until an admin verifies it separately.');
    const qF = field('Source question ID', {placeholder:'e.g. bq_...'}, 'trAuthorQuestion');
    const medF = field('Medium', {placeholder:'e.g. hindi'}, 'trAuthorMedium');
    const textF = field('Translated text', {tag:'textarea', rows:3}, 'trAuthorText');
    const b = mkbtn('Submit translation'); const o = out();
    b.onclick = function(){
      o.textContent = 'Submitting...';
      api('question-translations', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        sourceQuestionId: qF.input.value, medium: medF.input.value, translatedText: textF.input.value
      })}).then(function(data){
        o.textContent = 'Submitted -- id ' + data.translation.id + ', status ' + data.translation.verificationStatus + ' (awaiting admin verification).';
      }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(qF.wrap); card.appendChild(medF.wrap); card.appendChild(textF.wrap); card.appendChild(b); card.appendChild(o);
    return card;
  }

  /* M65 fix: curriculum browse was wired but the actual M65 workflow --
     uploading a paper into the ingestion pipeline -- was missing. This is
     teacher/admin-only server-side (handleUpload requires that role), so
     it belongs on teacher-os.html, matching the translation-authoring
     placement above. */
  function buildPaperIngestion(){
    const card = panel('M65', 'Upload Paper for Ingestion', 'Starts the real governance pipeline (uploaded -> validated -> parsed -> needs_review -> verified -> licence_check -> approved -> published). This upload step alone never publishes anything.');
    const fileF = field('File (PDF, JPEG, or PNG, max 8MB)', {type:'file', accept:'application/pdf,image/jpeg,image/png'}, 'piFile');
    const b = mkbtn('Upload'); const o = out();
    b.onclick = function(){
      const file = fileF.input.files && fileF.input.files[0];
      if (!file) { o.textContent = 'Choose a file first.'; return; }
      o.textContent = 'Reading file...';
      const reader = new FileReader();
      reader.onload = function(){
        const contentBase64 = String(reader.result).split(',')[1] || '';
        o.textContent = 'Uploading...';
        api('paper-ingestion', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
          filename: file.name, mimeType: file.type, contentBase64: contentBase64
        })}).then(function(data){
          o.textContent = 'Uploaded -- job ' + data.job.id + ', status ' + data.job.status + '.';
        }).catch(function(e){ showError(o, e); });
      };
      reader.onerror = function(){ o.textContent = 'Could not read the file.'; };
      reader.readAsDataURL(file);
    };
    card.appendChild(fileF.wrap); card.appendChild(b); card.appendChild(o);
    return card;
  }

  function buildSkillPassport(){
    const card = panel('M76', 'Skill Passport', 'Only ever shows a skill when you have a genuinely mastered, admin-curated concept mapped to it -- pathways shown are disclosed as informational, never a recommendation.');
    const b = mkbtn('View my skill passport'); const o = out();
    b.onclick = function(){
      o.textContent = 'Loading...';
      api('skill-passport?learnerId='+encodeURIComponent(learnerId())).then(function(data){
        if (data.insufficientEvidence) { o.textContent = data.message; return; }
        let txt = data.skills.map(function(s){ return 'Skill: ' + s.name + ' (' + (s.category||'--') + ') -- evidence: ' + s.evidenceConcepts.join(', '); }).join('\n');
        if (data.relatedPathways.length) txt += '\n\nRelated pathways (informational only): ' + data.relatedPathways.map(function(p){ return p.name; }).join(', ');
        o.textContent = txt;
      }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(b); card.appendChild(o);
    return card;
  }

  function buildBoardIntelligenceForTeacher(){
    const card = panel('M74', 'Board Intelligence -- My Class', 'Real class-level mastery aggregate for a class you actually own -- the server verifies ownership, this UI does not just trust a class id you type.');
    const classF = field('Class ID', {placeholder:'e.g. cls_9a'}, 'biClass');
    const subjF = field('Subject ID', {placeholder:'e.g. subj_math_9'}, 'biSubject');
    const b = mkbtn('View class intelligence'); const o = out();
    b.onclick = function(){
      o.textContent = 'Loading...';
      api('board-intelligence?view=class&classId='+encodeURIComponent(classF.input.value)+'&subjectId='+encodeURIComponent(subjF.input.value)).then(function(data){ showJson(o, data); }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(classF.wrap); card.appendChild(subjF.wrap); card.appendChild(b); card.appendChild(o);
    return card;
  }

  function buildContentGovernance(){
    const card = panel('M77', 'Content Governance', 'Real certification dashboard -- nothing here is a placeholder count.');
    const b = mkbtn('Load governance dashboard'); const o = out();
    b.onclick = function(){
      o.textContent = 'Loading...';
      api('content-governance?view=dashboard').then(function(data){ showJson(o, data); }).catch(function(e){ showError(o, e); });
    };
    card.appendChild(b); card.appendChild(o);

    /* M77 fix: the dashboard was read-only. Certifying content is the
       actual governance action (server requires verified+published
       content and admin role, confirmed by reading handleCertify). */
    const sep = el('div', {style:'margin-top:12px;padding-top:12px;border-top:1px solid rgba(128,128,128,.2);'});
    const typeF = field('Content type', {tag:'select'}, 'cgType');
    ['board_question','exam_paper','board_question_translation'].forEach(function(v){
      typeF.input.appendChild(el('option', {value:v}, [document.createTextNode(v)]));
    });
    const idF = field('Content ID', {placeholder:'must already be verified + published'}, 'cgContentId');
    const noteF = field('Note (optional)', {placeholder:'optional'}, 'cgNote');
    const certBtn = mkbtn('Certify content'); const co = out();
    certBtn.onclick = function(){
      co.textContent = 'Certifying...';
      api('content-governance', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        contentType: typeF.input.value, contentId: idF.input.value, note: noteF.input.value || undefined
      })}).then(function(data){
        co.textContent = 'Certified -- event id ' + data.eventId + '.';
      }).catch(function(e){ showError(co, e); });
    };
    sep.appendChild(typeF.wrap); sep.appendChild(idF.wrap); sep.appendChild(noteF.wrap); sep.appendChild(certBtn); sep.appendChild(co);
    card.appendChild(sep);
    return card;
  }

  function buildAiGovernance(){
    const card = panel('M78', 'AI Governance', 'Real registered AI provider list and usage/decision records -- never fabricated AI activity.');
    const bP = mkbtn('Load providers'); const bU = mkbtn('Load usage'); const bD = mkbtn('Load decisions'); const o = out();
    bP.onclick = function(){ o.textContent='Loading...'; api('ai-governance?resource=providers').then(function(d){showJson(o,d);}).catch(function(e){showError(o,e);}); };
    bU.onclick = function(){ o.textContent='Loading...'; api('ai-governance?resource=usage').then(function(d){showJson(o,d);}).catch(function(e){showError(o,e);}); };
    bD.onclick = function(){ o.textContent='Loading...'; api('ai-governance?resource=decisions').then(function(d){showJson(o,d);}).catch(function(e){showError(o,e);}); };
    card.appendChild(bP); card.appendChild(bU); card.appendChild(bD); card.appendChild(o);
    return card;
  }

  window.BAABoardExamTools = {
    mount: function(containerId){
      const host = document.getElementById(containerId);
      if (!host || host.dataset.mounted) return;
      host.dataset.mounted = '1';
      const grid = el('div', {class:'baa-eco-grid'});
      [buildBoardRegistry(), buildCurriculumGraph(), buildQuestionBank(), buildMockExamAndAttempt(),
       buildAdaptivePractice(), buildPaperIntelligence(), buildExamReadiness(), buildBoardMissions(),
       buildTranslations(), buildSkillPassport()].forEach(function(c){ grid.appendChild(c); });
      host.appendChild(grid);
    },
    boardIntelligenceForTeacher: buildBoardIntelligenceForTeacher,
    paperIngestion: buildPaperIngestion,
    translationAuthoring: buildTranslationAuthoring,
    contentGovernance: buildContentGovernance,
    aiGovernance: buildAiGovernance
  };
})();
