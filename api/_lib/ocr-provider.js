// BAA M65 — OCR/parse provider abstraction (Blueprint V3.2 §H / IB-07).
//
// This environment has no OCR/document-AI credentials configured — no
// Google Vision key, no Textract key, no Gemini-vision key wired for this
// purpose specifically (chat.js's Gemini key is a separate, already-scoped
// concern for the AI Tutor, not reused here). Per the execution
// instructions: "Do not create a fake OCR implementation merely to satisfy
// the roadmap" and "clearly document what is available."
//
// So: this module defines the provider *contract* the ingestion pipeline
// depends on, and ships exactly one implementation of it — a null
// provider that honestly reports OCR as not configured. When a real
// provider is wired up (by setting the relevant env var and adding an
// adapter here), the pipeline code in api/v1/[...route].js does not need
// to change at all — it already only talks to this contract.

export async function runOcr({ contentHash, mimeType }) {
  const provider = process.env.OCR_PROVIDER || null;
  if (!provider) {
    // Honest, structured "not available" result — not a fabricated
    // transcription. The ingestion job is routed to
    // needs_manual_transcription rather than silently invented text.
    return {
      provider: null,
      status: 'not_configured',
      text: null,
      errorCode: 'OCR_PROVIDER_NOT_CONFIGURED',
      errorMessage: 'No OCR_PROVIDER is configured in this environment. This document requires manual transcription before it can proceed past ingestion.',
    };
  }
  // No provider adapter is implemented yet. If OCR_PROVIDER is set to a
  // value this module doesn't recognize, fail loudly and specifically —
  // never silently fall through to a fabricated result.
  const err = new Error(`OCR_PROVIDER is set to '${provider}' but no adapter for it exists in this codebase yet.`);
  err.code = 'OCR_PROVIDER_UNSUPPORTED';
  throw err;
}
