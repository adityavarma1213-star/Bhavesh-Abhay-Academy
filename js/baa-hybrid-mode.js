// js/baa-hybrid-mode.js
// BAA OS — Module 3, M3-A: Hybrid Mode foundation.
// Combines an existing AI Mode plan with the student's Custom Mode path.
// This checkpoint does NOT implement AI-vs-student conflict resolution,
// automatic weighting, server persistence, or adaptive Hybrid Mode.
// It is intentionally isolated so M1 and M2 remain independently usable.
//
// Security/honesty: inputs are validated and rendered by callers with
// textContent. No learner evidence or AI conclusions are fabricated.

(function (global) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MODE = 'hybrid';
  const MAX_STEPS = 14;
  const VALID_TYPES = new Set(['learn', 'practice', 'review', 'assessment', 'tutor', 'custom']);
  const STORAGE_KEY = 'baa_hybrid_path_v1';
  const VALID_PRIORITIES = new Set(['student', 'balanced', 'ai']);

  function cleanText(value, max) {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, max)
      : '';
  }

  function normalizeStep(step, source, index) {
    if (!step || typeof step !== 'object') return null;
    const title = cleanText(step.title, 120);
    const minutes = Number(step.minutes);
    const type = cleanText(step.type, 20);
    if (!title || !Number.isInteger(minutes) || minutes < 5 || minutes > 120) return null;

    const safeType = source === 'custom' ? 'custom' : type;
    if (!VALID_TYPES.has(safeType)) return null;

    return {
      id: (typeof step.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(step.id))
        ? step.id
        : `${source}-${index}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
      title,
      minutes,
      type: safeType,
      source,
      completed: Boolean(step.completed),
      included: step.included !== false,
      reason: cleanText(step.reason, 240) || (
        source === 'custom'
          ? 'Student-created Custom Mode step.'
          : 'AI Mode step from the current learning plan.'
      ),
    };
  }

  function normalizePath(raw) {
    if (!raw || typeof raw !== 'object') {
      return { schemaVersion: SCHEMA_VERSION, mode: MODE, steps: [], totalMinutes: 0 };
    }

    const rawSteps = Array.isArray(raw.steps) ? raw.steps.slice(0, MAX_STEPS) : [];
    const steps = rawSteps
      .map((step, index) => normalizeStep(step, step?.source === 'custom' ? 'custom' : 'ai', index))
      .filter(Boolean);

    return {
      schemaVersion: SCHEMA_VERSION,
      mode: MODE,
      steps,
      totalMinutes: steps
        .filter((step) => step.included !== false)
        .reduce((sum, step) => sum + step.minutes, 0),
      generatedAt: cleanText(raw.generatedAt, 40) || new Date().toISOString(),
      ...(raw.priority !== undefined ? { priority: cleanPriority(raw.priority) } : {}),
      ...(raw.conflictPolicy ? { conflictPolicy: cleanText(raw.conflictPolicy, 180) } : {}),
    };
  }

  function cleanPriority(value) {
    return VALID_PRIORITIES.has(value) ? value : 'balanced';
  }

  function conflictKey(step) {
    return cleanText(step?.title, 120).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function resolveConflicts(steps, priority = 'balanced') {
    const chosenPriority = cleanPriority(priority);
    const seen = new Map();
    const result = [];

    for (const step of steps) {
      const key = conflictKey(step);
      if (!key) {
        result.push(step);
        continue;
      }

      const existingIndex = seen.get(key);
      if (existingIndex == null) {
        seen.set(key, result.length);
        result.push(step);
        continue;
      }

      const existing = result[existingIndex];
      if (chosenPriority === 'balanced') {
        // Balanced mode keeps both explicitly; the student can exclude one.
        result.push(step);
        continue;
      }

      const preferredSource = chosenPriority === 'student' ? 'custom' : 'ai';
      if (step.source === preferredSource && existing.source !== preferredSource) {
        result[existingIndex] = step;
      }
    }

    return result;
  }

  function applyPriority(path, priority) {
    const normalized = normalizePath(path);
    const chosenPriority = cleanPriority(priority);
    const resolved = resolveConflicts(normalized.steps, chosenPriority);
    const ids = new Set(resolved.map((step) => step.id));

    normalized.steps = normalized.steps
      .filter((step) => ids.has(step.id))
      .map((step) => ({ ...step, priority: chosenPriority }));
    normalized.totalMinutes = normalized.steps
      .filter((step) => step.included !== false)
      .reduce((sum, step) => sum + step.minutes, 0);
    normalized.priority = chosenPriority;
    normalized.conflictPolicy = chosenPriority === 'student'
      ? 'Student-created step wins same-title conflicts.'
      : chosenPriority === 'ai'
        ? 'AI step wins same-title conflicts.'
        : 'Both sides remain available; student decides by include/exclude.';
    return savePath(normalized);
  }

  function compose(aiPlan, customPath) {
    const aiSteps = Array.isArray(aiPlan?.steps) ? aiPlan.steps : [];
    const customSteps = Array.isArray(customPath?.steps) ? customPath.steps : [];

    const normalizedAI = aiSteps
      .map((step, index) => normalizeStep(step, 'ai', index))
      .filter(Boolean);

    const normalizedCustom = customSteps
      .map((step, index) => normalizeStep(step, 'custom', index))
      .filter(Boolean);

    const steps = [...normalizedAI, ...normalizedCustom].slice(0, MAX_STEPS);

    return {
      schemaVersion: SCHEMA_VERSION,
      mode: MODE,
      steps,
      totalMinutes: steps.reduce((sum, step) => sum + step.minutes, 0),
      generatedAt: new Date().toISOString(),
      sources: {
        ai: normalizedAI.length,
        custom: normalizedCustom.length,
      },
    };
  }

  function savePath(path) {
    const normalized = normalizePath(path);
    const priority = cleanPriority(path?.priority);
    if (path && typeof path === 'object' && path.priority !== undefined) {
      normalized.priority = priority;
      normalized.conflictPolicy = cleanText(path.conflictPolicy, 180);
    }
    try {
      if (!global.localStorage) {
        return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Hybrid Mode storage is unavailable.' } };
      }
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return { ok: true, path: normalized };
    } catch {
      return { ok: false, error: { code: 'STORAGE_WRITE_FAILED', message: 'Hybrid Mode could not save the combined path.' } };
    }
  }

  function getPath() {
    try {
      if (!global.localStorage) return normalizePath(null);
      return normalizePath(JSON.parse(global.localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch {
      return normalizePath(null);
    }
  }

  function setStepIncluded(path, id, included) {
    const normalized = normalizePath(path);
    const step = normalized.steps.find((item) => item.id === id);
    if (!step) return { ok: false, error: { code: 'STEP_NOT_FOUND', message: 'Hybrid Mode step was not found.' } };
    step.included = included !== false;
    return savePath(normalized);
  }

  function moveStep(path, id, direction) {
    const normalized = normalizePath(path);
    const index = normalized.steps.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, error: { code: 'STEP_NOT_FOUND', message: 'Hybrid Mode step was not found.' } };
    const next = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : index;
    if (next < 0 || next >= normalized.steps.length) return { ok: true, path: normalized };
    const moved = normalized.steps.splice(index, 1)[0];
    normalized.steps.splice(next, 0, moved);
    normalized.totalMinutes = normalized.steps.filter((step) => step.included !== false)
      .reduce((sum, step) => sum + step.minutes, 0);
    return savePath(normalized);
  }

  function getActiveSteps(path) {
    return normalizePath(path).steps.filter((step) => step.included !== false);
  }

  function saveStudentAdjustedPath(path) {
    const normalized = normalizePath(path);
    normalized.steps = normalized.steps.map((step) => ({
      ...step,
      included: step.included === false ? false : true,
    }));
    normalized.totalMinutes = normalized.steps
      .filter((step) => step.included === true)
      .reduce((sum, step) => sum + step.minutes, 0);
    return savePath(normalized);
  }

  function resetPath() {
    try {
      if (!global.localStorage) {
        return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Hybrid Mode storage is unavailable.' } };
      }
      global.localStorage.removeItem(STORAGE_KEY);
      return {
        ok: true,
        path: normalizePath(null),
      };
    } catch {
      return { ok: false, error: { code: 'STORAGE_RESET_FAILED', message: 'Hybrid Mode could not be reset.' } };
    }
  }

  function getSummary(path) {
    const normalized = normalizePath(path);
    const active = normalized.steps.filter((step) => step.included !== false);
    return {
      mode: MODE,
      priority: normalized.priority || 'balanced',
      totalSteps: normalized.steps.length,
      activeSteps: active.length,
      aiSteps: normalized.steps.filter((step) => step.source === 'ai').length,
      customSteps: normalized.steps.filter((step) => step.source === 'custom').length,
      totalMinutes: active.reduce((sum, step) => sum + step.minutes, 0),
    };
  }

  global.BAAHybridMode = {
    SCHEMA_VERSION,
    MODE,
    STORAGE_KEY,
    MAX_STEPS,
    compose,
    normalizePath,
    savePath,
    saveStudentAdjustedPath,
    setStepIncluded,
    moveStep,
    getActiveSteps,
    getPath,
    VALID_PRIORITIES: Array.from(VALID_PRIORITIES),
    cleanPriority,
    resolveConflicts,
    applyPriority,
    resetPath,
    getSummary,
  };
})(window);
