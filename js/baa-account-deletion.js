/* BAA M55 — server-side account deletion client
   Build-first implementation. This module is intentionally separate from
   the existing local-storage trust controls so UI pages can adopt the
   authenticated deletion flow without reimplementing the API contract.
*/
(function (global) {
  'use strict';

  const ENDPOINT = '/api/account/delete';
  const CONFIRMATION = 'DELETE MY ACCOUNT';

  async function deleteAccount(options = {}) {
    const confirmation = String(options.confirmation || '');
    if (confirmation !== CONFIRMATION) {
      return { ok: false, error: 'DELETE_CONFIRMATION_REQUIRED', confirmation: CONFIRMATION };
    }

    const response = await fetch(ENDPOINT, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: CONFIRMATION }),
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
      deleted: body?.deleted !== false,
      message: body?.message || 'Account deletion completed.',
    };
  }

  function confirmationPhrase() { return CONFIRMATION; }
  function endpoint() { return ENDPOINT; }

  global.BAAAccountDeletion = {
    deleteAccount,
    confirmationPhrase,
    endpoint,
  };
})(typeof window !== 'undefined' ? window : global);
