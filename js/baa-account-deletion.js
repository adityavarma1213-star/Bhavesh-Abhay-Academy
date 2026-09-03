/* BAA M55 — server-side account deletion client
   Build-first implementation. This module is intentionally separate from
   the existing local-storage trust controls so UI pages can adopt the
   authenticated deletion flow without reimplementing the API contract.
*/
(function (global) {
  'use strict';

  const ENDPOINT = '/api/account/delete';
  const CONFIRMATION = 'DELETE MY ACCOUNT';
  const DEFAULT_TIMEOUT_MS = 15000;
  const MAX_RESPONSE_BYTES = 1024 * 1024;
  const MAX_CONFIRMATION_CHARS = 64;

  async function readJsonResponse(response) {
    const declared = Number(response?.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      try { response.body?.cancel?.(); } catch (_) {}
      return { ok: false, error: 'ACCOUNT_DELETION_RESPONSE_TOO_LARGE' };
    }

    if (!response?.body || typeof response.body.getReader !== 'function') {
      try {
        const text = await response.text();
        const size = typeof TextEncoder !== 'undefined'
          ? new TextEncoder().encode(text).byteLength
          : typeof Buffer !== 'undefined'
            ? Buffer.byteLength(text, 'utf8')
            : text.length;
        if (size > MAX_RESPONSE_BYTES) return { ok: false, error: 'ACCOUNT_DELETION_RESPONSE_TOO_LARGE' };
        return { ok: true, body: JSON.parse(text) };
      } catch (error) {
        if (error?.message === 'ACCOUNT_DELETION_RESPONSE_TOO_LARGE') return { ok: false, error: 'ACCOUNT_DELETION_RESPONSE_TOO_LARGE' };
        return { ok: false, error: 'ACCOUNT_DELETION_INVALID_RESPONSE' };
      }
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        const chunk = part.value instanceof Uint8Array ? part.value : new Uint8Array(part.value || []);
        total += chunk.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          try { await reader.cancel(); } catch (_) {}
          return { ok: false, error: 'ACCOUNT_DELETION_RESPONSE_TOO_LARGE' };
        }
        chunks.push(chunk);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const text = new TextDecoder().decode(bytes);
      try { return { ok: true, body: JSON.parse(text) }; }
      catch (_) { return { ok: false, error: 'ACCOUNT_DELETION_INVALID_RESPONSE' }; }
    } catch (_) {
      try { await reader.cancel(); } catch (_) {}
      return { ok: false, error: 'ACCOUNT_DELETION_INVALID_RESPONSE' };
    }
  }

  async function deleteAccount(options = {}) {
    const confirmation = String(options.confirmation || '');
    if (confirmation.length > MAX_CONFIRMATION_CHARS || confirmation !== CONFIRMATION) {
      return { ok: false, error: 'DELETE_CONFIRMATION_REQUIRED', confirmation: CONFIRMATION };
    }

    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1000, Math.min(60000, Number(options.timeoutMs)))
      : DEFAULT_TIMEOUT_MS;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(ENDPOINT, {
        method: 'DELETE', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ confirmation: CONFIRMATION }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      const parsed = await readJsonResponse(response);
      if (!parsed.ok) return { ok: false, error: parsed.error, message: 'Account deletion returned an invalid response. No completion is claimed.' };
      const body = parsed.body;
      if (!response.ok) return { ok: false, status: response.status, error: body?.error?.code || body?.error || 'ACCOUNT_DELETION_FAILED', message: body?.error?.message || body?.message || 'Account deletion could not be completed.' };
      return { ok: true, status: response.status, deleted: body?.deleted === true, learnerCount: Number.isFinite(Number(body?.learnerCount)) ? Number(body.learnerCount) : null, message: body?.message || 'Account deletion completed.' };
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, error: 'ACCOUNT_DELETION_TIMEOUT', message: 'Account deletion request timed out. No completion is claimed.' };
      return { ok: false, error: 'ACCOUNT_DELETION_NETWORK_ERROR', message: 'Account deletion could not reach the server. No completion is claimed.' };
    } finally { if (timeout) clearTimeout(timeout); }
  }

  function confirmationPhrase() { return CONFIRMATION; }
  function endpoint() { return ENDPOINT; }
  global.BAAAccountDeletion = { deleteAccount, confirmationPhrase, endpoint, defaultTimeoutMs: DEFAULT_TIMEOUT_MS, maxResponseBytes: MAX_RESPONSE_BYTES, maxConfirmationChars: MAX_CONFIRMATION_CHARS };
})(typeof window !== 'undefined' ? window : global);
