// BAA M03 — authenticated Hybrid Mode server sync bridge.
// Loads the persisted learner-owned Hybrid Mode path into the existing
// BAAHybridMode module. It never chooses a learner from arbitrary storage.
(function (global) {
  'use strict';

  const ATTR = 'data-baa-m03-server-sync';
  const EVENT = 'baa:m03-server-sync';

  function learnerId() {
    return String(global.BAA_LEARNER_ID || '').trim();
  }

  async function sync() {
    const api = global.BAAHybridMode;
    const id = learnerId();
    if (!api || typeof api.loadServer !== 'function' || !id) {
      return { ok: false, error: { code: 'HYBRID_MODE_SYNC_UNAVAILABLE' } };
    }

    const result = await api.loadServer(id);
    if (result?.ok) {
      global.dispatchEvent(new CustomEvent(EVENT, { detail: result }));
    }
    return result;
  }

  function start() {
    if (document.documentElement.hasAttribute(ATTR)) return;
    document.documentElement.setAttribute(ATTR, '1');

    // BAAHybridMode may be loaded before or after this bridge because the
    // shared catalogue uses deterministic dynamic script insertion.
    if (global.BAAHybridMode) {
      sync();
      return;
    }

    let attempts = 0;
    const timer = global.setInterval(function () {
      attempts += 1;
      if (global.BAAHybridMode) {
        global.clearInterval(timer);
        sync();
      } else if (attempts >= 100) {
        global.clearInterval(timer);
      }
    }, 50);
  }

  global.BAAM03ServerSync = { sync };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(window);
