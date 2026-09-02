// BAA OS — M15 client bridge for server-authoritative parent policy.
(function (global) {
  'use strict';

  const versions = new Map();
  const MAX_RESPONSE_BYTES = 1024 * 1024;

  async function readJsonResponse(response) {
    const contentLength = Number(response.headers?.get?.('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) return null;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader(); const chunks = []; let total = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          total += part.value?.byteLength || 0;
          if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); return null; }
          chunks.push(part.value);
        }
      } catch (_) { try { await reader.cancel(); } catch (_e) {} return null; }
      const bytes = new Uint8Array(total); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      try { return JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { return null; }
    }
    try {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) return null;
      return JSON.parse(text);
    } catch (_) { return null; }
  }

  function learnerId() { return String(global.BAA_LEARNER_ID || '').trim(); }
  function rememberVersion(id, updatedAt) { if (updatedAt) versions.set(id, String(updatedAt)); }

  async function load(id = learnerId()) {
    if (!id) return { ok: false, error: { code: 'LEARNER_REQUIRED', message: 'A learner context is required.' } };
    try {
      const response = await fetch(`/api/m15-parent-policy?learnerId=${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await readJsonResponse(response);
      if (!data) return { ok: false, error: { code: 'POLICY_INVALID_RESPONSE', message: 'Parent policy returned an invalid response.' } };
      if (!response.ok) return { ok: false, error: data?.error || { code: 'POLICY_LOAD_FAILED', message: 'Parent policy could not be loaded.' } };
      rememberVersion(id, data?.updatedAt);
      return { ok: true, learnerId: id, policy: data.policy, updatedAt: data?.updatedAt || null };
    } catch { return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Parent policy could not reach the server.' } }; }
  }

  async function save(policy, id = learnerId()) {
    if (!id) return { ok: false, error: { code: 'LEARNER_REQUIRED', message: 'A learner context is required.' } };
    try {
      const expectedUpdatedAt = versions.get(id);
      const response = await fetch('/api/m15-parent-policy', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ learnerId: id, ...(policy || {}), ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) }) });
      const data = await readJsonResponse(response);
      if (!data) return { ok: false, error: { code: 'POLICY_INVALID_RESPONSE', message: 'Parent policy returned an invalid response.' } };
      if (!response.ok) {
        if (data?.updatedAt) rememberVersion(id, data.updatedAt);
        return { ok: false, error: data?.error || { code: 'POLICY_SAVE_FAILED', message: 'Parent policy could not be saved.' }, updatedAt: data?.updatedAt || null };
      }
      rememberVersion(id, data?.updatedAt);
      return { ok: true, learnerId: id, policy: data.policy, updatedAt: data?.updatedAt || null };
    } catch { return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Parent policy could not reach the server.' } }; }
  }

  global.BAAM15ParentPolicy = { load, save };
})(window);
