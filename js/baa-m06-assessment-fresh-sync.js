/* BAA M06 — Smart Assessment fresh server snapshot bridge.
 * The assessment engine remains local-first for anonymous/testing sessions,
 * but authenticated server hydration must never consume a stale cached
 * learner snapshot. This bridge hardens the existing GET transport without
 * duplicating the assessment engine or changing anonymous behavior.
 */
(function (global) {
  'use strict';
  if (global.__BAA_M06_FRESH_SYNC__) return;
  global.__BAA_M06_FRESH_SYNC__ = true;

  const originalFetch = global.fetch && global.fetch.bind(global);
  if (!originalFetch) return;

  function isAssessmentSnapshot(input, init) {
    const raw = typeof input === 'string' ? input : (input && input.url);
    if (!raw) return false;
    let url;
    try { url = new URL(raw, global.location.href); } catch (_) { return false; }
    if (!url.pathname.endsWith('/api/v1/assessment')) return false;
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    return method === 'GET' && url.searchParams.has('learnerId');
  }

  global.fetch = function m06FreshAssessmentFetch(input, init) {
    if (!isAssessmentSnapshot(input, init)) return originalFetch(input, init);
    const options = { ...(init || {}) };
    options.credentials = options.credentials || 'include';
    options.cache = 'no-store';
    const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    options.headers = headers;
    return originalFetch(input, options);
  };

  global.BAAM06FreshSync = {
    enabled: true,
    endpoint: '/api/v1/assessment',
    policy: 'authenticated learner snapshots use no-store'
  };
})(window);
