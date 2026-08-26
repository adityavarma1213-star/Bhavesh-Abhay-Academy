/* BAA M11 — server-authoritative planner recommendation surface.
 * The existing planner remains the local/private planning engine; this panel
 * exposes the production evidence recommendation path without presenting
 * browser-local evidence as authoritative.
 */
(function (global) {
  'use strict';

  const PANEL_ID = 'baa-m11-server-recommendations';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function learnerId() {
    return String(global.BAA_LEARNER_ID || document.body?.dataset?.learnerId || '').trim();
  }

  function mount() {
    if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);
    if (!document.body || !/student-os\.html$/i.test(location.pathname)) return null;

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-labelledby', `${PANEL_ID}-title`);
    panel.style.cssText = 'margin:24px 0;padding:18px;border:1px solid rgba(127,127,127,.28);border-radius:16px;background:rgba(127,127,127,.06);';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <h2 id="${PANEL_ID}-title" style="margin:0">Planner recommendations</h2>
          <p style="margin:6px 0 0;opacity:.78">Evidence-based guidance from your authenticated BAA learning record.</p>
        </div>
        <button type="button" data-m11-refresh>Refresh</button>
      </div>
      <div data-m11-state style="margin-top:14px" aria-live="polite">Loading server recommendations…</div>`;

    const host = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    host.appendChild(panel);
    panel.querySelector('[data-m11-refresh]')?.addEventListener('click', () => loadAndRender(panel));
    return panel;
  }

  function render(panel, payload) {
    const state = panel.querySelector('[data-m11-state]');
    if (!payload?.ok) {
      state.textContent = payload?.error === 'LEARNER_ID_REQUIRED'
        ? 'Sign in as a learner to receive server-backed recommendations.'
        : 'Server recommendations are unavailable right now. No local evidence is being presented as server data.';
      return;
    }
    const rows = Array.isArray(payload.recommendations) ? payload.recommendations : [];
    if (!rows.length) {
      state.innerHTML = '<p>No evidence-backed recommendation is due yet. Keep learning and BAA will surface guidance when enough evidence exists.</p>';
      return;
    }
    state.innerHTML = `<div style="display:grid;gap:10px">${rows.map((r, i) => `
      <article style="padding:12px;border-radius:12px;background:rgba(127,127,127,.08)">
        <div style="font-weight:700">${i + 1}. ${esc(r.concept || 'Concept')}</div>
        <div style="margin-top:4px;opacity:.82">${esc(r.subject || 'General')} · ${esc(r.type || 'revision')} · ${esc(r.priority || 'medium')} priority · ${esc(r.estimatedMinutes || 15)} min</div>
        <ul style="margin:8px 0 0;padding-left:20px">${(r.reasons || []).map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>
        <small style="display:block;margin-top:8px;opacity:.68">Based on ${esc(r.evidenceCount || 0)} recorded evidence points; this is study guidance, not a diagnosis or outcome prediction.</small>
      </article>`).join('')}</div>`;
  }

  async function loadAndRender(panel) {
    const state = panel.querySelector('[data-m11-state]');
    state.textContent = 'Loading server recommendations…';
    if (!global.BAAPlannerServerRecommendations) {
      state.textContent = 'Planner recommendation service is not available on this page.';
      return;
    }
    const payload = await global.BAAPlannerServerRecommendations.load(learnerId());
    render(panel, payload);
  }

  function start() {
    const panel = mount();
    if (panel) loadAndRender(panel);
  }

  global.BAAM11PlannerServerUI = { mount, loadAndRender, render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(window);
