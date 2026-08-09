/* ================= AI TUTOR IMAGE UNDERSTANDING (js/image.js) =================
   Fully additive module. Loaded AFTER student-os.html's main inline <script>,
   so it can call that script's global appendErrorMsg() for error bubbles.
   Nothing in here touches chat/streaming/markdown/math/memory/retry logic —
   the only integration point is the tiny public API below, which sendChat()
   in student-os.html reads from.

   Public API (window.BAAImage):
     getPendingImage()   -> {mimeType, data, previewUrl} | null
     clearPendingImage() -> void
*/
(function () {
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const MAX_RAW_BYTES = 10 * 1024 * 1024;            // reject originals bigger than this outright
  const MAX_DIMENSION = 1600;                        // longest side after compression, in px
  const JPEG_QUALITY_START = 0.82;
  const TARGET_MAX_BASE64_BYTES = 4 * 1024 * 1024;   // keep comfortably under Vercel Edge body limits

  let pendingImage = null; // {mimeType, data (base64, no data: prefix), previewUrl (full data URL)}

  function $(id) { return document.getElementById(id); }

  function showImageError(msg) {
    if (typeof appendErrorMsg === 'function') appendErrorMsg(msg);
    else alert(msg); // extremely defensive fallback — should never actually trigger
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
  // (PNGs are kept as PNG, since worksheet screenshots with text often stay
  // sharper that way and PNGs are usually already reasonably small).
  // Steps JPEG quality down further if the result is still too large.
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
    return dataUrl; // "data:image/jpeg;base64,...."
  }

  async function handleFile(file) {
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      showImageError("That file type isn't supported — please upload a PNG, JPEG, or WEBP image.");
      return;
    }
    if (file.size > MAX_RAW_BYTES) {
      showImageError('That image is too large (max 10MB) — try a smaller photo or a cropped screenshot.');
      return;
    }

    try {
      const dataUrl = await compressImage(file);
      if (dataUrl.length > TARGET_MAX_BASE64_BYTES) {
        showImageError('This image is still too large after compression — try cropping it closer to the question.');
        return;
      }
      const commaIdx = dataUrl.indexOf(',');
      const meta = dataUrl.slice(5, commaIdx); // "image/jpeg;base64"
      const mimeType = meta.split(';')[0];
      const base64 = dataUrl.slice(commaIdx + 1);

      pendingImage = { mimeType, data: base64, previewUrl: dataUrl };
      renderPreview();
    } catch {
      showImageError("Couldn't read that image — please try again with a different file.");
    }
  }

  function renderPreview() {
    const wrap = $('imagePreviewWrap');
    const thumb = $('imagePreviewThumb');
    if (!wrap || !thumb) return;
    if (pendingImage) {
      thumb.src = pendingImage.previewUrl;
      wrap.style.display = 'flex';
    } else {
      thumb.src = '';
      wrap.style.display = 'none';
    }
  }

  function clearPendingImage() {
    pendingImage = null;
    renderPreview();
    const input = $('imageFileInput');
    if (input) input.value = '';
  }

  function getPendingImage() {
    return pendingImage;
  }

  function initImageUI() {
    const btn = $('imageUploadBtn');
    const input = $('imageFileInput');
    const removeBtn = $('imagePreviewRemove');
    const dropzone = $('chatLog'); // drag & drop straight onto the conversation

    if (!btn || !input) return; // markup not present on this page — nothing to wire up

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0]));
    if (removeBtn) removeBtn.addEventListener('click', clearPendingImage);

    if (dropzone) {
      ['dragover', 'dragenter'].forEach((evt) => {
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropzone.classList.add('drag-over');
        });
      });
      ['dragleave', 'drop'].forEach((evt) => {
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropzone.classList.remove('drag-over');
        });
      });
      dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleFile(file);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', initImageUI);

  window.BAAImage = { getPendingImage, clearPendingImage };
})();
