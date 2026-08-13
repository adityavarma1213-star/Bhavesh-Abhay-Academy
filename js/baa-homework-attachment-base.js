/* ============================================================
   js/baa-homework-attachment-base.js
   BAA OS — Module 8 attachment contract shared by M8-A2/M8-C.

   CHECKPOINT: M8-C hardening.

   WHY THIS IS A SEPARATE FILE:
   Image and PDF attachments previously duplicated their basic validation
   and metadata-shaping logic. Keeping one small, dependency-free contract
   prevents the two attachment paths from drifting before M8-D adds more
   integration work.

   SCOPE: validate common file metadata and create a metadata-only base
   descriptor. This file never reads file bytes, stores files, or evaluates
   attachment content. Feature-specific modules remain responsible for
   compression/extraction and their own limits.
   ============================================================ */
(function (global) {
  'use strict';

  const MAX_FILE_NAME_CHARS = 200;

  function isFileLike(file) {
    return !!file && typeof file === 'object' && typeof file.size === 'number';
  }

  function validateCommonFile(file) {
    if (!isFileLike(file)) return { ok: false, error: 'FILE_REQUIRED' };
    if (!Number.isFinite(file.size) || file.size <= 0) {
      return { ok: false, error: 'INVALID_FILE_SIZE' };
    }
    return { ok: true };
  }

  function sanitizeFileName(fileName) {
    if (typeof fileName !== 'string') return null;
    const trimmed = fileName.trim().slice(0, MAX_FILE_NAME_CHARS);
    return trimmed || null;
  }

  function buildBaseAttachment({ type, mimeType, sizeBytes, fileName } = {}) {
    if (typeof type !== 'string' || !type.trim()) return null;
    if (typeof mimeType !== 'string' || !mimeType.trim()) return null;
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
    return {
      type: type.trim().slice(0, 40),
      mimeType: mimeType.trim().slice(0, 120),
      sizeBytes: Math.round(sizeBytes),
      fileName: sanitizeFileName(fileName),
    };
  }

  global.BAAHomeworkAttachmentBase = {
    MAX_FILE_NAME_CHARS,
    isFileLike,
    validateCommonFile,
    sanitizeFileName,
    buildBaseAttachment,
  };
})(typeof window !== 'undefined' ? window : global);
