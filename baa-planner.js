/* ============================================================
   js/baa-planner.js
   BAA OS — SECTION C, Part 2: AI Planner.

   HONEST DATA RULE: the Planner never invents study history. Every
   task it creates is traceable to a reason (a concept state, a
   mistake pattern, an upcoming assessment, or a student goal) that
   BAAIntelligence / BAAAssessment can show evidence for. Completing
   a task is recorded as completion, NOT as mastery — mastery is only
   ever decided by Section B's evidence-gated learningMemory.

   STORAGE: separate, clearly-labeled LOCAL / PRIVATE TESTING ONLY
   localStorage key. This does not duplicate Section B's evidence
   store — it stores planner-specific state (tasks, goals, time
   preference, upcoming assessments) and READS evidence from
   BAAAssessment / BAAIntelligence rather than copying it.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'baa_section_c_planner_v1';
  const SCHEMA_VERSION = 1;

  // Minimum spacing (days) the Planner will leave between a practice task
  // finishing and scheduling a reassessment for the same concept. Not a
  // claim of scientifically-validated spaced repetition — just "don't
  // reassess the instant after one practice session."
  const MIN_DAYS_BEFORE_REASSESSMENT = 1;
  const DEFAULT_AVAILABLE_MINUTES = 30;
  const MAX_TASKS_PER_DAY = 6;

  function intel() {
    if (typeof global.BAAIntelligence === 'undefined') {
      throw new Error('BAAIntelligence must be loaded before baa-planner.js');
    }
    return global.BAAIntelligence;
  }
  function baaAssess() { return global.BAAAssessment; }

  function todayStr(offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }
  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------- Storage ----------
  function emptyStore() {
    return {
      meta: {
        schemaVersion: SCHEMA_VERSION,
        storageType: 'LOCAL_BROWSER_STORAGE_TESTING_ONLY',
        createdAt: new Date().toISOString(),
      },
      preferences: { availableMinutesPerDay: DEFAULT_AVAILABLE_MINUTES },
      goals: [],               // { id, text, createdAt }
      upcomingAssessments: [],  // { id, title, subject, date, assessmentId? }
      tasks: [],                // full task history — never silently deleted, see below
      lastPlannedDate: null,
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.meta?.schemaVersion !== SCHEMA_VERSION) return emptyStore();
      return parsed;
    } catch {
      return emptyStore();
    }
  }
  function save(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      pushSync(store);
      return true;
    } catch (e) {
      console.warn('[BAA Section C] Could not save planner data (quota or private mode?)', e);
      return false;
    }
  }

  // ---------- G7: real per-learner server sync (Checkpoint 1) ----------
  // Off by default (syncLearnerId === null) so every existing local/anon/
  // test code path is completely unchanged. A logged-in session turns this
  // on via setSyncTarget(); after that, every save() also pushes the
  // current store to the server in the background, non-blocking, and
  // failures never affect the local (source-of-truth-for-this-tab) copy.
  let syncLearnerId = null;
  let syncInFlight = false;
  let syncQueuedAgain = false;

  function setSyncTarget(learnerId) {
    syncLearnerId = learnerId || null;
  }

  function pushSync(store) {
    if (!syncLearnerId || typeof fetch === 'undefined') return;
    if (syncInFlight) { syncQueuedAgain = true; return; }
    syncInFlight = true;
    fetch(`/api/v1/planner?learnerId=${encodeURIComponent(syncLearnerId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferences: store.preferences,
        goals: store.goals,
        upcomingAssessments: store.upcomingAssessments,
        tasks: store.tasks,
      }),
    }).catch(e => { if(global.BAAOfflineSync) global.BAAOfflineSync.enqueue(`/api/v1/planner?learnerId=${encodeURIComponent(syncLearnerId)}`, {method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({preferences:store.preferences,goals:store.goals,upcomingAssessments:store.upcomingAssessments,tasks:store.tasks})}); console.warn('[BAA Section C] Planner sync queued offline', e); })
      .finally(() => {
        syncInFlight = false;
        if (syncQueuedAgain) { syncQueuedAgain = false; pushSync(load()); }
      });
  }

  // Pulls the learner's server snapshot and merges it into the local store
  // (union by id — never silently drops a locally-created item that hasn't
  // synced yet), then arms setSyncTarget so subsequent saves push through.
  // Call this once, right after a student session is confirmed logged in.
  async function hydrateFromServer(learnerId) {
    if (!learnerId || typeof fetch === 'undefined') return false;
    try {
      const res = await fetch(`/api/v1/planner?learnerId=${encodeURIComponent(learnerId)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const { snapshot } = await res.json();
      const store = load();
      if (snapshot.preferences?.availableMinutesPerDay != null) {
        store.preferences.availableMinutesPerDay = snapshot.preferences.availableMinutesPerDay;
      }
      const byId = (list) => new Map(list.map(x => [x.id, x]));
      const mergedGoals = byId(store.goals);
      (snapshot.goals || []).forEach(g => { if (!mergedGoals.has(g.id)) mergedGoals.set(g.id, g); });
      store.goals = Array.from(mergedGoals.values());

      const mergedUpcoming = byId(store.upcomingAssessments);
      (snapshot.upcomingAssessments || []).forEach(u => { if (!mergedUpcoming.has(u.id)) mergedUpcoming.set(u.id, u); });
      store.upcomingAssessments = Array.from(mergedUpcoming.values());

      const mergedTasks = byId(store.tasks);
      (snapshot.tasks || []).forEach(t => { if (!mergedTasks.has(t.id)) mergedTasks.set(t.id, { ...t, history: [] }); });
      store.tasks = Array.from(mergedTasks.values());

      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      setSyncTarget(learnerId);
      return true;
    } catch (e) {
      console.warn('[BAA Section C] Could not hydrate planner from server — continuing with local data only.', e);
      return false;
    }
  }

  // ============================================================
  // PREFERENCES / GOALS / UPCOMING ASSESSMENTS (simple, student-facing)
  // ============================================================
  function setAvailableMinutes(minutes) {
    const n = Number(minutes);
    if (!Number.isFinite(n) || n <= 0) return false;
    const store = load();
    store.preferences.availableMinutesPerDay = Math.min(180, Math.round(n));
    save(store);
    return true;
  }
  function getPreferences() { return load().preferences; }

  function addGoal(text) {
    if (!text || !String(text).trim()) return null;
    const store = load();
    const goal = { id: uid('goal'), text: String(text).trim().slice(0, 120), createdAt: new Date().toISOString() };
    store.goals.push(goal);
    save(store);
    return goal;
  }
  function removeGoal(goalId) {
    const store = load();
    store.goals = store.goals.filter(g => g.id !== goalId);
    save(store);
  }
  function getGoals() { return load().goals; }

  function addUpcomingAssessment({ title, subject, date, assessmentId } = {}) {
    if (!title || !date) return null;
    const store = load();
    const row = {
      id: uid('upcoming'),
      title: String(title).trim().slice(0, 120),
      subject: subject || null,
      date, // YYYY-MM-DD, student-entered
      assessmentId: assessmentId || null,
      createdAt: new Date().toISOString(),
    };
    store.upcomingAssessments.push(row);
    save(store);
    return row;
  }
  function removeUpcomingAssessment(id) {
    const store = load();
    store.upcomingAssessments = store.upcomingAssessments.filter(a => a.id !== id);
    save(store);
  }
  function getUpcomingAssessments() {
    return load().upcomingAssessments
      .filter(a => daysBetween(todayStr(), a.date) >= -1) // drop things clearly in the past
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // ============================================================
  // CONNECTING TASKS TO REAL BAA FUNCTIONALITY
  // ============================================================
  // Finds a real catalog assessment that actually contains this concept, so
  // "Practice X" never leads nowhere. Returns null (honestly) if none exists
  // in this testing build's small question bank.
  function findAssessmentForConcept(concept) {
    if (typeof global.BAAAssessmentCatalog === 'undefined' || typeof global.BAAGetQuestion === 'undefined') return null;
    for (const a of global.BAAAssessmentCatalog) {
      if (a.questionIds.some(qid => {
        const q = global.BAAGetQuestion(qid);
        return q && q.concept === concept;
      })) {
        return a.id;
      }
    }
    return null;
  }

  function buildAction(type, concept, errorType) {
    if (type === 'review_mistake' || type === 'learn' || type === 'tutor_session') {
      // Bounded context only — concept + (optional) mistake, never the full history.
      const contextBits = [`I'd like help with ${intel()._humanConcept(concept)}.`];
      if (errorType) contextBits.push(`I keep making this kind of mistake: ${intel()._humanConcept(errorType)}.`);
      return { kind: 'tutor', tutorPrompt: contextBits.join(' ') };
    }
    const assessmentId = findAssessmentForConcept(concept);
    if (assessmentId) return { kind: 'assessment', assessmentId };
    return { kind: 'none', note: 'No matching practice assessment is available yet in this testing build.' };
  }

  // ============================================================
  // TASK CANDIDATE GENERATION — every candidate carries its reasons.
  // ============================================================
  function generateCandidates() {
    const summary = intel().getLearningSummary();
    const upcoming = getUpcomingAssessments();
    const goals = getGoals();
    const candidates = [];

    // Weak concepts -> practice tasks. Struggling ranks above needs_revision.
    for (const c of [...summary.struggling, ...summary.needsRevision]) {
      const matchingUpcoming = upcoming.find(u => u.subject && u.subject === c.subject);
      const reasons = [`${c.stateLabel}: ${c.why}`];
      let priority = c.state === 'struggling' ? 'high' : 'medium';
      if (matchingUpcoming) {
        const days = daysBetween(todayStr(), matchingUpcoming.date);
        reasons.push(`Upcoming "${matchingUpcoming.title}" in ${days} day${days === 1 ? '' : 's'} covers ${matchingUpcoming.subject}.`);
        priority = 'high';
      }
      const goalMatch = goals.find(g => c.conceptLabel.toLowerCase().includes(g.text.toLowerCase())
        || g.text.toLowerCase().includes(c.conceptLabel.toLowerCase().split(' ')[0]));
      if (goalMatch) reasons.push(`Supports your goal: "${goalMatch.text}".`);

      candidates.push({
        type: 'practice',
        title: `Practice: ${c.conceptLabel}`,
        concept: c.concept,
        subject: c.subject,
        estimatedMinutes: c.state === 'struggling' ? 20 : 15,
        priority,
        reasons,
        action: buildAction('practice', c.concept),
      });
    }

    // Confirmed, not-yet-improving mistake patterns -> a short, targeted tutor review.
    for (const m of intel().getMistakeIntelligence().filter(x => x.status === 'possible_misconception' && x.improving !== 'improving')) {
      candidates.push({
        type: 'review_mistake',
        title: `Review mistake pattern: ${m.conceptLabel}`,
        concept: m.concept,
        subject: m.subject,
        estimatedMinutes: 10,
        priority: 'medium',
        reasons: [`The same type of error (${m.errorLabel}) has appeared ${m.occurrenceCount} times in ${m.conceptLabel} — worth checking with the AI Tutor, not a diagnosis.`],
        action: buildAction('review_mistake', m.concept, m.errorType),
      });
    }

    // Concepts currently "learning" with an upcoming assessment in the same subject.
    for (const c of summary.learning) {
      const matchingUpcoming = upcoming.find(u => u.subject && u.subject === c.subject);
      if (!matchingUpcoming) continue;
      const days = daysBetween(todayStr(), matchingUpcoming.date);
      candidates.push({
        type: 'learn',
        title: `Keep learning: ${c.conceptLabel}`,
        concept: c.concept,
        subject: c.subject,
        estimatedMinutes: 15,
        priority: 'medium',
        reasons: [c.why, `Upcoming "${matchingUpcoming.title}" in ${days} day${days === 1 ? '' : 's'} covers ${c.subject}.`],
        action: buildAction('learn', c.concept),
      });
    }

    // Reassessment scheduling: a concept whose most recent evidence is still
    // needs_revision/learning AND whose most recent practice-task completion
    // was at least MIN_DAYS_BEFORE_REASSESSMENT ago.
    const store = load();
    const completedPractice = store.tasks.filter(t => t.status === 'completed' && (t.type === 'practice' || t.type === 'learn'));
    for (const t of completedPractice) {
      const state = intel().getConceptState(t.concept);
      if (!state || (state.state !== 'needs_revision' && state.state !== 'learning' && state.state !== 'struggling')) continue;
      const already = store.tasks.some(x => x.type === 'reassessment' && x.concept === t.concept
        && new Date(x.createdAt) > new Date(t.completedAt));
      if (already) continue;
      const daysSince = daysBetween(t.completedAt.slice(0, 10), todayStr());
      if (daysSince < MIN_DAYS_BEFORE_REASSESSMENT) continue;
      candidates.push({
        type: 'reassessment',
        title: `Reassess: ${state.conceptLabel}`,
        concept: t.concept,
        subject: t.subject,
        estimatedMinutes: 10,
        priority: 'medium',
        reasons: [`You practiced ${state.conceptLabel} ${daysSince} day${daysSince === 1 ? '' : 's'} ago — a short reassessment checks whether it's sticking.`],
        action: buildAction('reassessment', t.concept),
      });
    }

    return candidates;
  }

  // ============================================================
  // DAILY PLAN — fits candidates into available time, priority first,
  // never overloads, and folds in missed tasks (rebalanced, not just
  // piled onto today).
  // ============================================================
  function priorityRank(p) { return p === 'high' ? 0 : p === 'medium' ? 1 : 2; }

  function checkAndRebalanceMissedTasks() {
    const store = load();
    const today = todayStr();
    let changed = false;
    for (const t of store.tasks) {
      if (t.status === 'pending' && t.scheduledDate < today) {
        // A missed task's underlying concept may have improved since it was
        // scheduled — check before assuming it's still needed.
        const state = t.concept ? intel().getConceptState(t.concept) : null;
        const stillNeeded = !state || state.state === 'needs_revision' || state.state === 'struggling' || state.state === 'learning';
        t.history.push({ at: new Date().toISOString(), event: 'missed', note: 'Not completed on its scheduled day.' });
        if (!stillNeeded) {
          t.status = 'cancelled';
          t.history.push({ at: new Date().toISOString(), event: 'cancelled', note: `No longer needed — ${t.concept ? intel()._humanConcept(t.concept) : 'this area'} now shows "${state.stateLabel}".` });
        } else {
          t.status = 'missed';
        }
        changed = true;
      }
    }
    if (changed) save(store);
    return changed;
  }

  function getDailyPlan(dateStr) {
    dateStr = dateStr || todayStr();
    if (typeof global.BAAParentApproval !== 'undefined' && !global.BAAParentApproval.canUse('planner')) {
      return {date:dateStr,minutesBudget:0,minutesPlanned:0,tasks:[],hasAnyEvidence:intel().getLearningSummary().hasAnyEvidence,hasCarriedMissedTasks:false,disabledByParentApproval:true};
    }
    checkAndRebalanceMissedTasks();
    const store = load();
    const parentLimit = typeof global.BAAParentApproval !== 'undefined' ? global.BAAParentApproval.getDailyMinutesLimit() : Infinity;
    const calendarContext = typeof global.BAASchoolCalendar !== 'undefined' ? global.BAASchoolCalendar.getDateContext(dateStr) : {events:[],isHoliday:false,examSubjects:[]};
    if(calendarContext.isHoliday){ return {date:dateStr,minutesBudget:minutesBudget,minutesPlanned:0,tasks:[],hasAnyEvidence:intel().getLearningSummary().hasAnyEvidence,hasCarriedMissedTasks:false,schoolHoliday:true,calendarEvents:calendarContext.events}; }
    const minutesBudget = Math.min(store.preferences.availableMinutesPerDay, parentLimit);

    let existing = store.tasks.filter(t => t.scheduledDate === dateStr && t.status !== 'cancelled');
    // Carry forward missed tasks from before today as eligible-for-today candidates too,
    // so they're rebalanced against today's plan rather than silently reappearing forever.
    const carriedMissed = dateStr === todayStr()
      ? store.tasks.filter(t => t.status === 'missed' && t.scheduledDate < dateStr)
      : [];

    // Only auto-generate NEW tasks for today, and only once per day (idempotent), so
    // reopening the Planner doesn't spam duplicate tasks.
    if (dateStr === todayStr() && store.lastPlannedDate !== dateStr) {
      const candidates = generateCandidates();
      let usedMinutes = existing.filter(t => t.status !== 'skipped').reduce((s, t) => s + t.estimatedMinutes, 0);
      const sorted = candidates.slice().sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
      const newTasks = [];
      for (const c of sorted) {
        if (newTasks.length + existing.length >= MAX_TASKS_PER_DAY) break;
        // Skip duplicating a task type+concept already scheduled today or missed-carried.
        const dup = existing.some(t => t.type === c.type && t.concept === c.concept)
          || carriedMissed.some(t => t.type === c.type && t.concept === c.concept);
        if (dup) continue;
        let minutes = c.estimatedMinutes;
        const remaining = minutesBudget - usedMinutes;
        if (minutes > remaining) minutes = remaining;
        if (minutes < 8) continue; // not enough time budget left for a meaningful task — leave it for tomorrow
        const task = {
          id: uid('task'),
          type: c.type,
          title: c.title,
          concept: c.concept,
          subject: c.subject,
          estimatedMinutes: minutes,
          priority: c.priority,
          reasons: c.reasons,
          action: c.action,
          status: 'pending',
          scheduledDate: dateStr,
          createdAt: new Date().toISOString(),
          completedAt: null,
          history: [{ at: new Date().toISOString(), event: 'created', note: 'Generated by the Planner.' }],
        };
        newTasks.push(task);
        usedMinutes += minutes;
      }
      store.tasks.push(...newTasks);
      store.lastPlannedDate = dateStr;
      save(store);
      existing = store.tasks.filter(t => t.scheduledDate === dateStr && t.status !== 'cancelled');
    }

    const allForToday = [...existing, ...carriedMissed].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    return {
      date: dateStr,
      minutesBudget,
      minutesPlanned: allForToday.filter(t => t.status === 'pending' || t.status === 'completed').reduce((s, t) => s + t.estimatedMinutes, 0),
      tasks: allForToday,
      hasAnyEvidence: intel().getLearningSummary().hasAnyEvidence,
      hasCarriedMissedTasks: carriedMissed.length > 0,
      calendarEvents: calendarContext.events,
    };
  }

  // ============================================================
  // WEEKLY VIEW
  // ============================================================
  function getWeeklyPlan() {
    checkAndRebalanceMissedTasks();
    const store = load();
    const days = [];
    for (let i = -3; i <= 3; i++) {
      const d = todayStr(i);
      const tasks = store.tasks.filter(t => t.scheduledDate === d);
      days.push({ date: d, isToday: i === 0, tasks });
    }
    return { days, upcomingAssessments: getUpcomingAssessments() };
  }

  // ============================================================
  // MONTHLY VIEW — Module 11
  // Read-only month-level view of the living plan. It groups real scheduled
  // tasks and student-entered upcoming assessments; it does not fabricate
  // future completion or mastery.
  // ============================================================
  function getMonthlyPlan(monthDate) {
    const base = monthDate ? new Date(monthDate) : new Date();
    if (Number.isNaN(base.getTime())) return { error: 'INVALID_MONTH', weeks: [] };
    const year = base.getFullYear();
    const month = base.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const store = load();
    const weeks = [];
    let cursor = new Date(first);
    while (cursor <= last) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(Math.min(
        new Date(year, month, cursor.getDate() + (6 - cursor.getDay())).getTime(),
        last.getTime()
      ));
      const startStr = weekStart.toISOString().slice(0,10);
      const endStr = weekEnd.toISOString().slice(0,10);
      const tasks = store.tasks.filter(t =>
        t.scheduledDate >= startStr && t.scheduledDate <= endStr && t.status !== 'cancelled'
      );
      const assessments = getUpcomingAssessments().filter(a => a.date >= startStr && a.date <= endStr);
      weeks.push({
        start: startStr,
        end: endStr,
        tasks,
        assessments,
        plannedMinutes: tasks.reduce((sum,t)=>sum+(Number(t.estimatedMinutes)||0),0),
      });
      cursor = new Date(year, month, weekEnd.getDate() + 1);
    }
    return {
      month: `${year}-${String(month+1).padStart(2,'0')}`,
      weeks,
      generatedFromEvidence: intel().getLearningSummary().hasAnyEvidence,
      activeGoals: getGoals().length,
    };
  }

  // ============================================================
  // TASK ACTIONS — student stays in control.
  // ============================================================
  function completeTask(taskId) {
    const store = load();
    const t = store.tasks.find(x => x.id === taskId);
    if (!t) return false;
    t.status = 'completed';
    t.completedAt = new Date().toISOString();
    t.history.push({ at: t.completedAt, event: 'completed', note: 'Marked complete by student. (Completion is recorded — mastery is decided separately, from real evidence.)' });
    save(store);
    return true;
  }
  function skipTask(taskId) {
    const store = load();
    const t = store.tasks.find(x => x.id === taskId);
    if (!t) return false;
    t.status = 'skipped';
    t.history.push({ at: new Date().toISOString(), event: 'skipped', note: 'Skipped by student.' });
    save(store);
    return true;
  }
  function rescheduleTask(taskId, newDate) {
    const store = load();
    const t = store.tasks.find(x => x.id === taskId);
    if (!t || !newDate) return false;
    const oldDate = t.scheduledDate;
    t.scheduledDate = newDate;
    t.status = 'pending';
    t.history.push({ at: new Date().toISOString(), event: 'rescheduled', note: `Moved from ${oldDate} to ${newDate} by student.` });
    save(store);
    return true;
  }

  global.BAAPlanner = {
    STORAGE_KEY,
    setAvailableMinutes,
    getPreferences,
    addGoal,
    removeGoal,
    getGoals,
    addUpcomingAssessment,
    removeUpcomingAssessment,
    getUpcomingAssessments,
    getDailyPlan,
    getWeeklyPlan,
    getMonthlyPlan,
    completeTask,
    skipTask,
    rescheduleTask,
    setSyncTarget,
    hydrateFromServer,
    _load: load,
    _emptyStore: emptyStore,
  };
})(window);
