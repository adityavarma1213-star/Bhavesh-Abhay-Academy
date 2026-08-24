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

  async function deleteAccount(options = {}) {
    const confirmation = String(options.confirmation || '');
    if (confirmation !== CONFIRMATION) {
      return { ok: false, error: 'DELETE_CONFIRMATION_REQUIRED', confirmation: CONFIRMATION };
    }

    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1000, Math.min(60000, Number(options.timeoutMs)))
      : DEFAULT_TIMEOUT_MS;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(ENDPOINT, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: CONFIRMATION }),
        ...(controller ? { signal: controller.signal } : {}),
      });

      let body = null;
      try { body = await response.json(); } catch (_) { body = null; }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: body?.error?.code || body?.error || 'ACCOUNT_DELETION_FAILED',
          message: body?.error?.message || body?.message || 'Account deletion could not be completed.',
        };
      }

      return {
        ok: true,
        status: response.status,
        deleted: body?.deleted === true,
        learnerCount: Number.isFinite(Number(body?.learnerCount)) ? Number(body.learnerCount) : null,
        message: body?.message || 'Account deletion completed.',
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        return { ok: false, error: 'ACCOUNT_DELETION_TIMEOUT', message: 'Account deletion request timed out. No completion is claimed.' };
      }
      return { ok: false, error: 'ACCOUNT_DELETION_NETWORK_ERROR', message: 'Account deletion could not reach the server. No completion is claimed.' };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function confirmationPhrase() { return CONFIRMATION; }
  function endpoint() { return ENDPOINT; }

  global.BAAAccountDeletion = {
    deleteAccount,
    confirmationPhrase,
    endpoint,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  };
})(typeof window !== 'undefined' ? window : global);
