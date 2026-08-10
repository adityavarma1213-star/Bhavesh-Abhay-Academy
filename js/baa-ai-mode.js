// js/baa-ai-mode.js
// BAA OS — Module 1, M1-A1 client orchestration.
// It gathers only bounded evidence from the existing intelligence/planner
// stores, calls the real AI Mode endpoint, and renders textContent-based UI.
// It does NOT implement Custom or Hybrid Mode and never fabricates a plan
// when the server is unavailable.

(function (global) {
  'use strict';

  const MAX_CONCEPTS = 20;

  function getInput() {
    const intel = global.BAAIntelligence;
    const planner = global.BAAPlanner;
    if (!intel || !planner) throw new Error('BAAIntelligence and BAAPlanner are required.');

    const states = typeof intel.getConceptStates === 'function'
      ? intel.getConceptStates().slice(0, MAX_CONCEPTS)
      : [];

    return {
      goal: (planner.getGoals?.()[0]?.text || '').trim(),
      concepts: states.map((c) => ({
        concept: c.concept,
        state: c.state,
        confidence: c.confidence,
        evidenceCount: Number(c.evidenceCount || 0),
      })),
      availableMinutesPerDay: Number(planner.getPreferences?.().availableMinutesPerDay || 30),
      upcomingAssessments: (planner.getUpcomingAssessments?.() || []).slice(0, 8).map((a) => ({
        title: a.title,
        subject: a.subject,
        date: a.date,
      })),
    };
  }

  async function generatePlan(goal, previousPlan = null) {
    const input = getInput();
    const finalGoal = String(goal || input.goal || '').trim().slice(0, 120);
    if (!finalGoal) {
      return { ok: false, error: { code: 'GOAL_REQUIRED', message: 'Add a learning goal before asking AI Mode to build a path.' } };
    }
    input.goal = finalGoal;
    if (previousPlan) input.previousPlan = previousPlan;

    let response;
    try {
      response = await fetch('/api/ai-mode.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      return { ok: false, error: { code: 'NETWORK_ERROR', message: 'AI Mode could not reach the server.' } };
    }

    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      return { ok: false, error: data?.error || { code: 'AI_MODE_ERROR', message: 'AI Mode could not build a plan.' } };
    }

    if (!data || data.schemaVersion !== 1 || data.mode !== 'ai' || !Array.isArray(data.steps)) {
      return { ok: false, error: { code: 'INVALID_PLAN', message: 'AI Mode returned an invalid plan.' } };
    }
    return { ok: true, plan: data };
  }

  function renderPlan(container, result) {
    if (!container) return;
    container.textContent = '';

    if (!result.ok) {
      const error = document.createElement('div');
      error.className = 'ai-mode-error';
      error.textContent = result.error?.message || 'AI Mode could not build a plan.';
      container.appendChild(error);
      return;
    }

    const plan = result.plan;
    const summary = document.createElement('p');
    summary.className = 'ai-mode-summary';
    summary.textContent = plan.summary;
    container.appendChild(summary);

    const list = document.createElement('ol');
    list.className = 'ai-mode-plan-list';
    plan.steps.forEach((step) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = step.title;
      const meta = document.createElement('span');
      meta.textContent = ` · ${step.minutes} min · ${step.type}`;
      const reason = document.createElement('div');
      reason.className = 'ai-mode-reason';
      reason.textContent = step.reason;
      item.append(title, meta, reason);
      list.appendChild(item);
    });
    container.appendChild(list);

    const bound = document.createElement('div');
    bound.className = 'ai-mode-bound';
    bound.textContent = `Evidence-bound AI Mode · ${plan.totalMinutes} minutes`;
    container.appendChild(bound);
  }

  let lastPlan = null;

  async function adaptPlan() {
    if (!lastPlan) {
      return { ok: false, error: { code: 'NO_PREVIOUS_PLAN', message: 'Build an AI Mode plan first, then adapt it to new evidence.' } };
    }
    const input = getInput();
    return generatePlan(input.goal, lastPlan);
  }

  function rememberPlan(result) {
    if (result?.ok) lastPlan = result.plan;
    return result;
  }

  global.BAAAIMode = {
    getInput,
    generatePlan,
    adaptPlan,
    rememberPlan,
    getLastPlan: () => lastPlan,
    renderPlan,
  };
})(window);
