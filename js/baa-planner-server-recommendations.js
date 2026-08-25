/* BAA M11 server recommendation bridge.
 * Keeps the existing planner's local/testing candidate generator intact while
 * exposing authenticated server evidence recommendations for production UI wiring.
 */
(function (global) {
  'use strict';

  async function load(learnerId) {
    if (!learnerId || typeof fetch !== 'function') return { ok: false, error: 'LEARNER_ID_REQUIRED', recommendations: [] };
    try {
      const response = await fetch(`/api/m11-planner-recommendations?learnerId=${encodeURIComponent(learnerId)}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: payload?.error?.code || 'RECOMMENDATIONS_FAILED', recommendations: [] };
      return payload;
    } catch (error) {
      return { ok: false, error: error?.message || 'RECOMMENDATIONS_NETWORK_FAILED', recommendations: [] };
    }
  }

  global.BAAPlannerServerRecommendations = { load };
})(window);
