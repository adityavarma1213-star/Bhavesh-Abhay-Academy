// BAA OS — Module 2, Custom / Individual Mode.
// Student-controlled learning path with bounded local editing and an
// authenticated server-backed sync path for cross-device persistence.
(function (global) {
  'use strict';

  const STORAGE_KEY = 'baaCustomModePath';
  const SCHEMA_VERSION = 1;
  const MAX_STEPS = 20;
  const MAX_TITLE = 120;
  const MIN_MINUTES = 5;
  const MAX_MINUTES = 180;
  const VALID_TYPES = new Set(['learn', 'practice', 'review', 'assessment', 'tutor']);

  function getStorage() { return global.localStorage; }
  function cleanText(value, max = MAX_TITLE) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }
  function validateStep(step) {
    if (!step || typeof step !== 'object') return { ok: false, code: 'INVALID_STEP' };
    const title = cleanText(step.title);
    const minutes = Number(step.minutes);
    const type = cleanText(step.type, 20);
    if (!title) return { ok: false, code: 'TITLE_REQUIRED' };
    if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) return { ok: false, code: 'INVALID_MINUTES' };
    if (!VALID_TYPES.has(type)) return { ok: false, code: 'INVALID_TYPE' };
    return { ok: true, value: { title, minutes, type } };
  }
  function normalizePath(value) {
    if (!value || typeof value !== 'object' || value.schemaVersion !== SCHEMA_VERSION || value.mode !== 'custom') {
      return { schemaVersion: SCHEMA_VERSION, mode: 'custom', steps: [] };
    }
    const raw = Array.isArray(value.steps) ? value.steps.slice(0, MAX_STEPS) : [];
    const steps = raw.reduce((normalized, step, rawIndex) => {
      const result = validateStep(step);
      if (!result.ok) return normalized;
      normalized.push({ id: cleanText(step?.id, 80) || `custom-${Date.now()}-${rawIndex}`, ...result.value, completed: Boolean(step?.completed) });
      return normalized;
    }, []);
    return { schemaVersion: SCHEMA_VERSION, mode: 'custom', steps };
  }
  function getPath() {
    const storage = getStorage();
    if (!storage) return { schemaVersion: SCHEMA_VERSION, mode: 'custom', steps: [] };
    try { return normalizePath(JSON.parse(storage.getItem(STORAGE_KEY) || 'null')); }
    catch { return { schemaVersion: SCHEMA_VERSION, mode: 'custom', steps: [] }; }
  }
  function savePath(path) {
    const normalized = normalizePath(path);
    const storage = getStorage();
    if (!storage) return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Custom Mode storage is unavailable in this browser.' } };
    try { storage.setItem(STORAGE_KEY, JSON.stringify(normalized)); return { ok: true, path: normalized }; }
    catch { return { ok: false, error: { code: 'STORAGE_WRITE_FAILED', message: 'Custom Mode could not save this path.' } }; }
  }
  function addStep(title, minutes, type) {
    const checked = validateStep({ title, minutes, type });
    if (!checked.ok) return { ok: false, error: checked };
    const path = getPath();
    if (path.steps.length >= MAX_STEPS) return { ok: false, error: { code: 'MAX_STEPS', message: `Custom Mode supports up to ${MAX_STEPS} steps.` } };
    path.steps.push({ id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...checked.value, completed: false });
    return savePath(path);
  }
  function removeStep(id) { const path = getPath(); path.steps = path.steps.filter((step) => step.id !== id); return savePath(path); }
  function toggleStep(id) {
    const path = getPath(); const step = path.steps.find((item) => item.id === id);
    if (!step) return { ok: false, error: { code: 'STEP_NOT_FOUND', message: 'Custom Mode step was not found.' } };
    step.completed = !step.completed; return savePath(path);
  }
  function moveStep(id, direction) {
    const path = getPath(); const index = path.steps.findIndex((step) => step.id === id);
    if (index < 0) return { ok: false, error: { code: 'STEP_NOT_FOUND', message: 'Custom Mode step was not found.' } };
    const nextIndex = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : index;
    if (nextIndex < 0 || nextIndex >= path.steps.length) return { ok: true, path };
    const [step] = path.steps.splice(index, 1); path.steps.splice(nextIndex, 0, step); return savePath(path);
  }
  function clearPath() { return savePath({ schemaVersion: SCHEMA_VERSION, mode: 'custom', steps: [] }); }

  async function loadServer(learnerId) {
    if (!learnerId) return { ok: false, error: { code: 'LEARNER_ID_REQUIRED' } };
    try {
      const response = await fetch(`/api/m02-custom-mode?learnerId=${encodeURIComponent(learnerId)}`, {
        credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, error: data?.error || { code: 'CUSTOM_MODE_SERVER_READ_FAILED' } };
      const path = normalizePath(data?.path);
      savePath(path);
      return { ok: true, path, updatedAt: data?.updatedAt || null };
    } catch { return { ok: false, error: { code: 'CUSTOM_MODE_NETWORK_ERROR' } }; }
  }

  async function saveServer(learnerId, path = getPath()) {
    if (!learnerId) return { ok: false, error: { code: 'LEARNER_ID_REQUIRED' } };
    const normalized = normalizePath(path);
    try {
      const response = await fetch(`/api/m02-custom-mode?learnerId=${encodeURIComponent(learnerId)}`, {
        method: 'PUT', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(normalized),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, error: data?.error || { code: 'CUSTOM_MODE_SERVER_WRITE_FAILED' } };
      return { ok: true, path: normalizePath(data?.path || normalized) };
    } catch { return { ok: false, error: { code: 'CUSTOM_MODE_NETWORK_ERROR' } }; }
  }

  async function clearServer(learnerId) {
    if (!learnerId) return { ok: false, error: { code: 'LEARNER_ID_REQUIRED' } };
    try {
      const response = await fetch(`/api/m02-custom-mode?learnerId=${encodeURIComponent(learnerId)}`, {
        method: 'DELETE', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, error: data?.error || { code: 'CUSTOM_MODE_SERVER_DELETE_FAILED' } };
      return savePath(normalizePath(data?.path));
    } catch { return { ok: false, error: { code: 'CUSTOM_MODE_NETWORK_ERROR' } }; }
  }

  global.BAACustomMode = {
    STORAGE_KEY, SCHEMA_VERSION, getPath, savePath, addStep, removeStep, toggleStep, moveStep, clearPath,
    validateStep, normalizePath, loadServer, saveServer, clearServer,
  };
})(window);