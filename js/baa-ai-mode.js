// js/baa-ai-mode.js
// BAA OS — Module 1, M1-A1 client orchestration.
// It asks the server-backed AI Mode adapter to build an evidence-bound plan.
// Learner evidence is never trusted from the browser; the server derives it
// from authenticated PostgreSQL state.
(function (global) {
  'use strict';

  const MAX_CONCEPTS = 20;
  const MAX_RESPONSE_BYTES = 1024 * 1024;

  async function readJsonBounded(response) {
    const declared = Number(response?.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      try { response.body?.cancel?.(); } catch (_) {}
      return { ok: false, error: { code: 'AI_MODE_RESPONSE_TOO_LARGE', message: 'AI Mode returned too much data.' } };
    }

    if (!response?.body || typeof response.body.getReader !== 'function') {
      try {
        const text = await response.text();
        const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text) : null;
        const size = bytes ? bytes.byteLength : typeof Buffer !== 'undefined' ? Buffer.byteLength(text, 'utf8') : text.length;
        if (size > MAX_RESPONSE_BYTES) {
          return { ok: false, error: { code: 'AI_MODE_RESPONSE_TOO_LARGE', message: 'AI Mode returned too much data.' } };
        }
        return { ok: true, data: JSON.parse(text) };
      } catch (error) {
        if (error?.message === 'AI_MODE_RESPONSE_TOO_LARGE') return { ok: false, error: { code: 'AI_MODE_RESPONSE_TOO_LARGE', message: 'AI Mode returned too much data.' } };
        return { ok: false, error: { code: 'AI_MODE_INVALID_RESPONSE', message: 'AI Mode returned an invalid response.' } };
      }
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value?.byteLength || 0;
        if (total > MAX_RESPONSE_BYTES) {
          try { await reader.cancel(); } catch (_) {}
          return { ok: false, error: { code: 'AI_MODE_RESPONSE_TOO_LARGE', message: 'AI Mode returned too much data.' } };
        }
        chunks.push(part.value);
      }
    } catch (_) {
      try { await reader.cancel(); } catch (_) {}
      return { ok: false, error: { code: 'AI_MODE_INVALID_RESPONSE', message: 'AI Mode returned an unreadable response.' } };
    }

    try {
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const text = new TextDecoder().decode(bytes);
      return { ok: true, data: JSON.parse(text) };
    } catch (_) {
      return { ok: false, error: { code: 'AI_MODE_INVALID_RESPONSE', message: 'AI Mode returned an invalid response.' } };
    }
  }

  function getInput() {
    const intel = global.BAAIntelligence;
    const planner = global.BAAPlanner;
    if (!intel || !planner) throw new Error('BAAIntelligence and BAAPlanner are required.');

    const states = typeof intel.getConceptStates === 'function'
      ? intel.getConceptStates().slice(0, MAX_CONCEPTS)
      : [];

    return {
      learnerId: String(global.BAA_LEARNER_ID || '').trim(),
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
    if (!input.learnerId) {
      return { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in as a learner before using AI Mode.' } };
    }

    let response;
    try {
      response = await fetch(`/api/m01-ai-mode?learnerId=${encodeURIComponent(input.learnerId)}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ goal: finalGoal, previousPlan }),
      });
    } catch {
      return { ok: false, error: { code: 'NETWORK_ERROR', message: 'AI Mode could not reach the server.' } };
    }

    const parsed = await readJsonBounded(response);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const data = parsed.data;
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