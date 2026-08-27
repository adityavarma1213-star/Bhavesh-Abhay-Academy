/* BAA M04 — authenticated Student OS Tutor transport bridge.
 * Routes the existing Tutor client transport through the M04 authoritative
 * evidence adapter without changing the existing chat UI or Gemini stream.
 */
(function (global) {
  'use strict';

  if (global.__BAA_M04_TUTOR_BRIDGE__) return;
  global.__BAA_M04_TUTOR_BRIDGE__ = true;

  const originalFetch = global.fetch.bind(global);

  function isTutorRequest(input, init) {
    const raw = typeof input === 'string' ? input : (input && input.url);
    if (!raw) return false;
    let url;
    try { url = new URL(raw, global.location.href); } catch (_) { return false; }
    if (!url.pathname.endsWith('/api/chat')) return false;
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    return method === 'POST';
  }

  async function routedFetch(input, init) {
    if (!isTutorRequest(input, init)) return originalFetch(input, init);

    const sourceRequest = input instanceof Request ? input : null;
    const options = { ...(init || {}) };
    if (sourceRequest) {
      options.method = options.method || sourceRequest.method;
      options.headers = options.headers || sourceRequest.headers;
      if (options.body == null && sourceRequest.method !== 'GET' && sourceRequest.method !== 'HEAD') {
        options.body = await sourceRequest.clone().text();
      }
    }

    if (typeof options.body === 'string' && options.body.trim()) {
      try {
        const body = JSON.parse(options.body);
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const learnerId = global.BAA_LEARNER_ID || body.learnerId || undefined;
          options.body = JSON.stringify({ ...body, ...(learnerId ? { learnerId } : {}) });
        }
      } catch (_) {
        // Preserve non-JSON tutor requests unchanged; the server will validate them.
      }
    }

    options.credentials = options.credentials || 'include';
    options.cache = 'no-store';
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    options.headers = headers;
    const target = new URL('/api/m04-ai-tutor', global.location.origin).toString();
    return originalFetch(target, options);
  }

  global.fetch = routedFetch;
  global.BAAM04TutorBridge = {
    enabled: true,
    endpoint: '/api/m04-ai-tutor'
  };
})(window);
