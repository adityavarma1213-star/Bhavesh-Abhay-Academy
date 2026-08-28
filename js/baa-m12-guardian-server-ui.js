/* BAA M12 — server-authoritative Guardian surface.
 * Academic-support only; never presents browser-local wellbeing data as
 * authoritative and never diagnoses mental health or personality.
 */
(function (global) {
  'use strict';
  const PANEL_ID = 'baa-m12-guardian-server';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }
  function learnerId() { return String(global.BAA_LEARNER_ID || document.body?.dataset?.learnerId || '').trim(); }
  function mount() {
    if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);
    if (!document.body || !/student-os\.html$/i.test(location.pathname)) return null;
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-labelledby', `${PANEL_ID}-title`);
    panel.style.cssText = 'margin:24px 0;padding:18px;border:1px solid rgba(127,127,127,.28);border-radius:16px;background:rgba(127,127,127,.06);';
    panel.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h2 id="${PANEL_ID}-title" style="margin:0">Academic Guardian</h2><p style="margin:6px 0 0;opacity:.78">Server-evaluated academic support signals from your learning record.</p></div><button type="button" data-m12-refresh>Refresh</button></div><div data-m12-state style="margin-top:14px" aria-live="polite">Loading Guardian…</div>`;
    (document.querySelector('main') || document.querySelector('[role="main"]') || document.body).appendChild(panel);
    panel.querySelector('[data-m12-refresh]')?.addEventListener('click', () => load(panel));
    return panel;
  }
  function render(panel, payload) {
    const state = panel.querySelector('[data-m12-state]');
    if (!payload?.ok) {
      state.textContent = payload?.error === 'LEARNER_ID_REQUIRED' ? 'Sign in as a learner to use the academic Guardian.' : 'Guardian is unavailable right now. No local browser state is being presented as server evidence.';
      return;
    }
    const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
    if (!alerts.length) {
      state.innerHTML = `<p>No academic support signal is currently due.</p><small style="opacity:.68">Tracked concepts: ${esc(payload.evidence?.trackedConcepts || 0)} · assessments: ${esc(payload.evidence?.assessments || 0)}. Guardian is academic-support only.</small>`;
      return;
    }
    state.innerHTML = `<div style="display:grid;gap:10px">${alerts.map(alert => `<article style="padding:12px;border-radius:12px;background:rgba(127,127,127,.08)"><strong>${esc(alert.title)}</strong><div style="margin-top:5px;opacity:.82">${esc(alert.severity)} · ${esc(alert.type)}</div><p style="margin:8px 0">${esc(alert.reason)}</p><small style="opacity:.68">This signal uses academic evidence only and is not a diagnosis.</small></article>`).join('')}</div>`;
  }
  async function load(panel) {
    const state = panel.querySelector('[data-m12-state]');
    state.textContent = 'Loading Guardian…';
    const id = learnerId();
    if (!id || typeof fetch !== 'function') { render(panel, { ok:false, error:'LEARNER_ID_REQUIRED' }); return; }
    try {
      const response = await fetch(`/api/m12-guardian?learnerId=${encodeURIComponent(id)}`, { credentials:'include', cache:'no-store', headers:{Accept:'application/json'} });
      const payload = await response.json().catch(() => ({}));
      render(panel, response.ok ? payload : { ok:false, error:payload?.error?.code || 'GUARDIAN_FAILED' });
    } catch (error) {
      render(panel, { ok:false, error:error?.message || 'GUARDIAN_NETWORK_FAILED' });
    }
  }
  function start() { const panel = mount(); if (panel) load(panel); }
  global.BAAM12GuardianServerUI = { mount, load, render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})(window);
