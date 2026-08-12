/* ============================================================
   js/baa-homework-pdf.js
   BAA OS — Module 8: M8-C PDF support.

   Scope: browser-side PDF text extraction using PDF.js. The shared
   attachment contract in js/baa-homework-attachment-base.js handles
   common file metadata validation/shaping; this module owns PDF-specific
   limits and extraction. The PDF file is
   never persisted by this module. Only extracted text + non-sensitive
   attachment metadata are handed to the existing homework data layer.

   M8-C deliberately supports text-based PDFs. A PDF that contains only
   scanned images and yields no extractable text is rejected honestly;
   image-PDF/OCR evaluation belongs to a later image-evaluation checkpoint.
   ============================================================ */
(function (global) {
  'use strict';

  const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
  const MAX_PDF_PAGES = 40;
  const MAX_EXTRACTED_CHARS = 8000;
  const MAX_SCANNED_IMAGE_PAGES = 3;
  const MAX_SCANNED_IMAGE_DATA_CHARS = 900000;
  const ALLOWED_PDF_MIME = 'application/pdf';

  function getPdfJs() {
    return global.pdfjsLib || null;
  }

  // The normal Homework Scanner page loads the shared attachment contract
  // first. Keep a tiny compatibility fallback so this feature module remains
  // safely embeddable/testable on its own; production pages use the shared
  // implementation rather than this fallback.
  function getAttachmentBase() {
    return global.BAAHomeworkAttachmentBase || {
      validateCommonFile(file) {
        if (!file || typeof file !== 'object') return { ok: false, error: 'FILE_REQUIRED' };
        if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'INVALID_FILE_SIZE' };
        return { ok: true };
      },
      buildBaseAttachment({ type, mimeType, sizeBytes, fileName } = {}) {
        if (typeof type !== 'string' || !type.trim()) return null;
        if (typeof mimeType !== 'string' || !mimeType.trim()) return null;
        if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
        return {
          type: type.trim().slice(0, 40),
          mimeType: mimeType.trim().slice(0, 120),
          sizeBytes: Math.round(sizeBytes),
          fileName: typeof fileName === 'string' && fileName.trim() ? fileName.trim().slice(0, 200) : null,
        };
      },
    };
  }

  function validatePdfFile(file) {
    const base = getAttachmentBase();
    if (!file || typeof file !== 'object') return { ok: false, error: 'PDF_REQUIRED' };
    if (file.type && file.type !== ALLOWED_PDF_MIME) return { ok: false, error: 'INVALID_PDF_TYPE' };
    const common = base.validateCommonFile(file);
    if (!common.ok) return { ok: false, error: 'INVALID_PDF_SIZE' };
    if (file.size > MAX_PDF_SIZE_BYTES) return { ok: false, error: 'PDF_TOO_LARGE' };
    return { ok: true };
  }

  function normalizeText(parts) {
    return parts
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_EXTRACTED_CHARS);
  }

  async function extractText(file, onProgress) {
    const validation = validatePdfFile(file);
    const base = getAttachmentBase();
    if (!validation.ok) return validation;

    const pdfjs = getPdfJs();
    if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
      return { ok: false, error: 'PDF_ENGINE_UNAVAILABLE' };
    }

    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: buffer });
      const pdf = await loadingTask.promise;

      if (!pdf || typeof pdf.numPages !== 'number' || pdf.numPages < 1) {
        return { ok: false, error: 'PDF_EMPTY' };
      }
      if (pdf.numPages > MAX_PDF_PAGES) {
        return { ok: false, error: 'PDF_TOO_MANY_PAGES', pages: pdf.numPages };
      }

      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = (content.items || [])
          .map(item => (item && typeof item.str === 'string') ? item.str : '')
          .join(' ')
          .trim();
        if (pageText) pages.push(pageText);
        if (typeof onProgress === 'function') onProgress(pageNumber, pdf.numPages);
      }

      const text = normalizeText(pages);
      let scannedImageDataUrls=[];
      if(text.length < 3){
        const limit=Math.min(pdf.numPages,MAX_SCANNED_IMAGE_PAGES);
        for(let pageNumber=1;pageNumber<=limit;pageNumber++){
          const page=await pdf.getPage(pageNumber);
          const viewport=page.getViewport({scale:1.25});
          const canvas=document.createElement('canvas'); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
          const ctx=canvas.getContext('2d',{willReadFrequently:false});
          await page.render({canvasContext:ctx,viewport}).promise;
          const data=canvas.toDataURL('image/jpeg',0.72);
          if(data.length<=MAX_SCANNED_IMAGE_DATA_CHARS) scannedImageDataUrls.push(data);
          canvas.width=0; canvas.height=0;
        }
        if(!scannedImageDataUrls.length) return {ok:false,error:'PDF_SCANNED_RENDER_FAILED',pages:pdf.numPages,extractedChars:0};
      }

      return {
        ok: true,
        text: text || 'Scanned homework image — evaluate the attached rendered pages.',
        pages: pdf.numPages,
        extractedChars: text.length,
        scannedImageDataUrls,
        attachment: {
          ...base.buildBaseAttachment({
            type: 'pdf',
            mimeType: ALLOWED_PDF_MIME,
            sizeBytes: file.size,
            fileName: file.name,
          }),
          originalSizeBytes: file.size,
          pageCount: pdf.numPages,
          extractedChars: text.length,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: 'PDF_PARSE_FAILED',
        detail: (error && error.message) ? error.message.slice(0, 240) : 'Unable to read this PDF',
      };
    }
  }

  global.BAAHomeworkPDF = {
    MAX_PDF_SIZE_BYTES,
    MAX_PDF_PAGES,
    MAX_EXTRACTED_CHARS,
    MAX_SCANNED_IMAGE_PAGES,
    validatePdfFile,
    extractText,
  };
})(typeof window !== 'undefined' ? window : global);
