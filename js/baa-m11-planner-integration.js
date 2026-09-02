/* BAA M11 — server recommendation UI bridge.
 * Uses the existing authenticated M11 API and the existing Planner surface.
 * It never replaces local planner state; it surfaces authoritative server
 * evidence recommendations alongside the existing student-controlled plan.
 */
(function (global) {
  'use strict';

  const API = '/api/m11-planner-recommendations';
  const MAX_RESPONSE_BYTES = 1024 * 1024;
  let bound = false;
  let learnerId = null;

  function escape(value) {
    const d = document.createElement('div');
    d.textContent = String(value == null ? '' : value);
    return d.innerHTML;
  }

  function getLearnerId() {
    return global.BAA_LEARNER_ID || learnerId || null;
  }

  async function readJsonBounded(response) {
    const declared = Number(response?.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      try { response.body?.cancel?.(); } catch (_) {}
      throw new Error('RECOMMENDATIONS_RESPONSE_TOO_LARGE');
    }
    if (!response?.body || typeof response.body.getReader !== 'function') {
      try { return await response.json(); } catch (_) { throw new Error('RECOMMENDATIONS_INVALID_RESPONSE'); }
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
          try { await reader.cancel('response-too-large'); } catch (_) {}
          throw new Error('RECOMMENDATIONS_RESPONSE_TOO_LARGE');
        }
        chunks.push(part.value);
      }
    } catch (error) {
      try { await reader.cancel(); } catch (_) {}
      if (error?.message === 'RECOMMENDATIONS_RESPONSE_TOO_LARGE') throw error;
      throw new Error('RECOMMENDATIONS_INVALID_RESPONSE');
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw new Error('RECOMMENDATIONS_INVALID_RESPONSE'); }
  }

  async function loadRecommendations() {
    const id = getLearnerId();
    const output = document.getElementById('m11ServerRecommendations');
    if (!output) return { ok: false, code: 'UI_NOT_READY' };
    if (!id) {
      output.innerHTML = '<div class="concept-why">Sign in as a learner to load server-backed recommendations.</div>';
      return { ok: false, code: 'LEARNER_SESSION_NOT_READY' };
    }
    output.innerHTML = '<div class="concept-why">Loading recommendations from your learning evidence…</div>';
    try {
      const response = await fetch(`${API}?learnerId=${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' });
      const payload = await readJsonBounded(response);
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || 'Planner recommendations unavailable.');
      const items = Array.isArray(payload.recommendations) ? payload.recommendations : [];
      if (!items.length) {
        output.innerHTML = '<div class="pf-empty"><span class="pe-icon">🌱</span><p>No server-backed recommendation is justified by the available evidence yet.</p></div>';
        return payload;
      }
      output.innerHTML = items.map(item => `
        <div class="concept-row">
          <div><b>${item.priority === 'high' ? '🔥' : '🎯'} ${escape(item.concept)}</b> · ${escape(item.subject)}</div>
          <div class="concept-why">${escape(item.estimatedMinutes)} min · ${escape(item.accuracy)}% observed accuracy · ${escape(item.evidenceCount)} evidence points</div>
          <div class="concept-why">${escape(item.reasons.join(' '))}</div>
        </div>`).join('');
      const note = document.createElement('div');
      note.className = 'concept-why';
      note.style.marginTop = '10px';
      note.textContent = 'Source: authenticated server learning evidence. These are study recommendations, not diagnoses or outcome predictions.';
      output.appendChild(note);
      return payload;
    } catch (error) {
      output.innerHTML = `<div class="ai-mode-error">${escape(error.message || 'Server planner recommendations are unavailable right now.')}</div>`;
      return { ok: false, code: 'SERVER_RECOMMENDATIONS_FAILED' };
    }
  }

  function mount() {
    if (bound) return true;
    const world = document.getElementById('world-planner');
    if (!world) return false;
    const inner = world.querySelector('.world-inner');
    if (!inner) return false;
    const section = document.createElement('section');
    section.className = 'baa-card';
    section.setAttribute('aria-labelledby', 'm11ServerRecommendationsTitle');
    section.innerHTML = `
      <div class="baa-card-head"><h2 id="m11ServerRecommendationsTitle">🧠 Server Evidence Recommendations</h2><span>M11 · live learner evidence</span></div>
      <p class="concept-why">These recommendations come from the authenticated server evidence store. They complement the student-controlled Planner and never invent missing evidence.</p>
      <div id="m11ServerRecommendations" aria-live="polite"><div class="concept-why">Waiting for learner session…</div></div>
      <button id="m11ServerRecommendationsRefresh" class="task-btn" type="button">Refresh server recommendations</button>`;
    inner.insertBefore(section, inner.firstChild);
    const refresh = document.getElementById('m11ServerRecommendationsRefresh');
    if (refresh) refresh.addEventListener('click', loadRecommendations);
    bound = true;
    if (getLearnerId()) loadRecommendations();
    return true;
  }

  function setLearner(id) {
    learnerId = id || null;
    if (learnerId && bound) loadRecommendations();
  }

  global.BAAM11PlannerIntegration = { mount, loadRecommendations, setLearner };

  function start() {
    mount();
    if (global.BAA_LEARNER_ID) setLearner(global.BAA_LEARNER_ID);
    let tries = 0;
    const timer = setInterval(function () {
      tries += 1;
      if (global.BAA_LEARNER_ID) {
        setLearner(global.BAA_LEARNER_ID);
        clearInterval(timer);
      } else if (tries >= 30) {
        clearInterval(timer);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
