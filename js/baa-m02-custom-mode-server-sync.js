// BAA M02 — authenticated server sync bridge.
// Keeps the existing Custom Mode editor/local state intact while making the
// PostgreSQL path reachable from the Student OS without trusting a browser
// learner id. Sync is best-effort: local editing remains available offline.
(function (global) {
  'use strict';

  const MARKER = 'data-baa-m02-server-sync';
  let running = false;

  function learnerId() {
    const context = global.BAALearnerContext;
    if (context && typeof context.getLearnerId === 'function') return context.getLearnerId();
    const candidate = global.BAA_LEARNER_ID;
    return typeof candidate === 'string' ? candidate.trim() : '';
  }

  async function sync() {
    if (running || !global.BAACustomMode) return { ok: false, error: { code: 'M02_UNAVAILABLE' } };
    const id = learnerId();
    if (!id) return { ok: false, error: { code: 'LEARNER_ID_UNAVAILABLE' } };
    running = true;
    try {
      const result = await global.BAACustomMode.loadServer(id);
      if (result.ok) {
        global.dispatchEvent(new CustomEvent('baa:m02-server-sync', { detail: result }));
      }
      return result;
    } finally {
      running = false;
    }
  }

  function start() {
    if (document.querySelector('script[' + MARKER + ']')) return;
    const script = document.currentScript;
    if (script) script.setAttribute(MARKER, '1');
    if (!global.BAACustomMode) return;
    sync().catch(function () {});
  }

  global.BAAM02ServerSync = { sync, start };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
