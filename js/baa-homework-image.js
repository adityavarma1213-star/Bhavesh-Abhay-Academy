/* ============================================================
   js/baa-homework-image.js
   BAA OS — Module 8: AI Homework Scanner — image attach UI.

   CHECKPOINT: M8-A2 (image upload / preview / compression).

   SCOPE OF THIS FILE: let a student select a photo of their homework,
   validate it, show a preview, remove/replace it, and compress it in
   the browser so it's ready for a future evaluation pipeline. This
   file does NOT call any AI evaluation endpoint (that's M8-B1) and
   does NOT grade, score, or "understand" the image in any way.

   COMPRESSION APPROACH: deliberately reuses the same proven pattern
   already shipped in js/image.js (AI Tutor image understanding) —
   same allowed types, same max-dimension resize via <canvas>, same
   JPEG quality step-down loop — adapted to this page's own element
   IDs and error surface instead of the chat's appendErrorMsg(). The
   two modules are kept separate (not shared) because they serve
   different features with different lifecycles and DOM hooks; sharing
   one singleton `pendingImage` across two independent pages/features
   would risk one clobbering the other.

   PRIVACY (matches js/image.js / SECTION-E-COVERAGE-MATRIX.md E-Inv2):
   the compressed image (base64 data URL) is held ONLY in an in-memory
   variable in this module. It is never written to localStorage and is
   cleared the moment the homework is submitted (or the student removes
   it). Only non-recoverable metadata (mime type, sizes, dimensions,
   file name) is ever handed to js/baa-homework.js for persistence —
   see that file's header for the matching data-layer privacy note.

   Public API (window.BAAHomeworkImage):
     getPendingImage()    -> {mimeType, dataUrl, originalSizeBytes,
                               compressedSizeBytes, width, height,
                               fileName} | null
     clearPendingImage()  -> void
     hasPendingImage()    -> boolean
   ============================================================ */
(function () {
  'use strict';

  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const MAX_RAW_BYTES = 10 * 1024 * 1024;            // reject originals bigger than this outright
  const MAX_DIMENSION = 1600;                        // longest side after compression, in px
  const JPEG_QUALITY_START = 0.82;
  const TARGET_MAX_BASE64_BYTES = 4 * 1024 * 1024;   // keep well under typical body/storage limits

  let pendingImage = null; // {mimeType, dataUrl, originalSizeBytes, compressedSizeBytes, width, height, fileName}

  function $(id) { return document.getElementById(id); }

  function showImageError(msg) {
    const status = $('hwImageStatus');
    const note = $('hwImageErrorNote');
    const text = $('hwImageErrorText');
    if (note && text) {
      text.textContent = msg;
      note.classList.add('show');
      clearTimeout(showImageError._hideTimer);
      showImageError._hideTimer = setTimeout(() => note.classList.remove('show'), 6000);
    }
    if (status) status.textContent = msg;
  }

  function clearImageError() {
    const note = $('hwImageErrorNote');
    if (note) note.classList.remove('show');
  }

  function loadImageEl(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // Resizes to MAX_DIMENSION on the longest side and re-encodes as JPEG
  // (PNGs are kept as PNG, since worksheet screenshots/scans with text
  // often stay sharper that way and PNGs are usually already reasonably
  // small). Steps JPEG quality down further if the result is still too
  // large. Same approach as js/image.js's compressImage().
  async function compressImage(file) {
    const img = await loadImageEl(file);
    let { width, height } = img;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(img.src);

    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    let quality = JPEG_QUALITY_START;
    let dataUrl = canvas.toDataURL(outType, quality);

    while (dataUrl.length > TARGET_MAX_BASE64_BYTES && quality > 0.4 && outType === 'image/jpeg') {
      quality -= 0.12;
      dataUrl = canvas.toDataURL(outType, quality);
    }
    return { dataUrl, width, height };
  }

  async function handleFile(file) {
    if (!file) return;
    clearImageError();

    const base = window.BAAHomeworkAttachmentBase;
    if (!base || !base.validateCommonFile || !base.buildBaseAttachment) {
      showImageError('Attachment support is temporarily unavailable. Please try again later.');
      return;
    }
    const common = base.validateCommonFile(file);
    if (!common.ok) {
      showImageError('That image could not be read — please choose a valid file.');
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      showImageError("That file type isn't supported — please upload a PNG, JPEG, or WEBP image.");
      return;
    }
    if (file.size > MAX_RAW_BYTES) {
      showImageError('That image is too large (max 10MB) — try a smaller photo or a cropped picture.');
      return;
    }

    try {
      const { dataUrl, width, height } = await compressImage(file);
      if (dataUrl.length > TARGET_MAX_BASE64_BYTES) {
        showImageError('This image is still too large after compression — try cropping it closer to the homework.');
        return;
      }
      const commaIdx = dataUrl.indexOf(',');
      const meta = dataUrl.slice(5, commaIdx); // "image/jpeg;base64"
      const mimeType = meta.split(';')[0];
      // Rough decoded-byte estimate from base64 length (base64 ~ 4/3 of raw bytes).
      const base64 = dataUrl.slice(commaIdx + 1);
      const compressedSizeBytes = Math.round(base64.length * 3 / 4);

      const baseMeta = base.buildBaseAttachment({
        type: 'image',
        mimeType,
        sizeBytes: file.size,
        fileName: file.name,
      });
      if (!baseMeta) {
        showImageError('That image could not be prepared safely. Please try another file.');
        return;
      }
      pendingImage = {
        ...baseMeta,
        originalSizeBytes: baseMeta.sizeBytes,
        compressedSizeBytes,
        width,
        height,
      };
      renderPreview();
      if (typeof window.onHwImageChanged === 'function') window.onHwImageChanged();
    } catch {
      showImageError("Couldn't read that image — please try again with a different file.");
    }
  }

  function formatKB(bytes) {
    if (typeof bytes !== 'number') return '';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function renderPreview() {
    const wrap = $('hwImagePreviewWrap');
    const thumb = $('hwImagePreviewThumb');
    const info = $('hwImagePreviewInfo');
    if (!wrap || !thumb) return;
    if (pendingImage) {
      thumb.src = pendingImage.dataUrl;
      if (info) {
        info.textContent = 'Prepared — ' + formatKB(pendingImage.originalSizeBytes) +
          ' → ' + formatKB(pendingImage.compressedSizeBytes) +
          ' · not yet evaluated (AI grading is a later checkpoint)';
      }
      wrap.style.display = 'flex';
    } else {
      thumb.src = '';
      if (info) info.textContent = '';
      wrap.style.display = 'none';
    }
  }

  function clearPendingImage() {
    pendingImage = null;
    renderPreview();
    clearImageError();
    const input = $('hwImageFileInput');
    if (input) input.value = '';
    if (typeof window.onHwImageChanged === 'function') window.onHwImageChanged();
  }

  function getPendingImage() {
    return pendingImage;
  }

  function hasPendingImage() {
    return !!pendingImage;
  }

  function initImageUI() {
    const btn = $('hwImageUploadBtn');
    const input = $('hwImageFileInput');
    const removeBtn = $('hwImagePreviewRemove');
    const replaceBtn = $('hwImagePreviewReplace');

    if (!btn || !input) return; // markup not present on this page — nothing to wire up

    btn.addEventListener('click', () => input.click());
    if (replaceBtn) replaceBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0]));
    if (removeBtn) removeBtn.addEventListener('click', clearPendingImage);
  }

  document.addEventListener('DOMContentLoaded', initImageUI);

  window.BAAHomeworkImage = { getPendingImage, clearPendingImage, hasPendingImage };
})();
