// BAA OS — M15 client bridge for server-authoritative parent policy.
(function (global) {
  'use strict';

  const versions = new Map();

  function learnerId() {
    return String(global.BAA_LEARNER_ID || '').trim();
  }

  function rememberVersion(id, updatedAt) {
    if (updatedAt) versions.set(id, String(updatedAt));
  }

  async function load(id = learnerId()) {
    if (!id) return { ok: false, error: { code: 'LEARNER_REQUIRED', message: 'A learner context is required.' } };
    try {
      const response = await fetch(`/api/m15-parent-policy?learnerId=${encodeURIComponent(id)}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, error: data?.error || { code: 'POLICY_LOAD_FAILED', message: 'Parent policy could not be loaded.' } };
      rememberVersion(id, data?.updatedAt);
      return { ok: true, learnerId: id, policy: data.policy, updatedAt: data?.updatedAt || null };
    } catch {
      return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Parent policy could not reach the server.' } };
    }
  }

  async function save(policy, id = learnerId()) {
    if (!id) return { ok: false, error: { code: 'LEARNER_REQUIRED', message: 'A learner context is required.' } };
    try {
      const expectedUpdatedAt = versions.get(id);
      const response = await fetch('/api/m15-parent-policy', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ learnerId: id, ...(policy || {}), ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (data?.updatedAt) rememberVersion(id, data.updatedAt);
        return { ok: false, error: data?.error || { code: 'POLICY_SAVE_FAILED', message: 'Parent policy could not be saved.' }, updatedAt: data?.updatedAt || null };
      }
      rememberVersion(id, data?.updatedAt);
      return { ok: true, learnerId: id, policy: data.policy, updatedAt: data?.updatedAt || null };
    } catch {
      return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Parent policy could not reach the server.' } };
    }
  }

  global.BAAM15ParentPolicy = { load, save };
})(window);
