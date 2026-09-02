/* BAA M11 server recommendation bridge.
 * Keeps the existing planner's local/testing candidate generator intact while
 * exposing authenticated server evidence recommendations for production UI wiring.
 */
(function (global) {
  'use strict';
  const MAX_RESPONSE_BYTES = 1024 * 1024;

  async function readJson(response) {
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
    const decoder = new TextDecoder();
    let total = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value?.byteLength || 0;
        if (total > MAX_RESPONSE_BYTES) {
          try { await reader.cancel(); } catch (_) {}
          throw new Error('RECOMMENDATIONS_RESPONSE_TOO_LARGE');
        }
        chunks.push(part.value);
      }
    } finally { try { reader.releaseLock(); } catch (_) {} }
    let text = '';
    for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
    text += decoder.decode();
    try { return JSON.parse(text); } catch (_) { throw new Error('RECOMMENDATIONS_INVALID_RESPONSE'); }
  }

  async function load(learnerId) {
    if (!learnerId || typeof fetch !== 'function') return { ok: false, error: 'LEARNER_ID_REQUIRED', recommendations: [] };
    try {
      const response = await fetch(`/api/m11-planner-recommendations?learnerId=${encodeURIComponent(learnerId)}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await readJson(response);
      if (!response.ok) return { ok: false, error: payload?.error?.code || 'RECOMMENDATIONS_FAILED', recommendations: [] };
      return payload;
    } catch (error) {
      return { ok: false, error: error?.message || 'RECOMMENDATIONS_NETWORK_FAILED', recommendations: [] };
    }
  }

  global.BAAPlannerServerRecommendations = { load };
})(window);
