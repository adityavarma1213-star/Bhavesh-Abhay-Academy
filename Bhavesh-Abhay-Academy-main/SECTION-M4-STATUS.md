# BAA Module 4 — AI Tutor Status

## M4-A — AI Tutor connection hardening
- Candidate status: COMPLETE
- Existing Gemini backend retained.
- Temporary debug logging removed from frontend and backend.
- Server-side API key architecture retained.
- Message/image validation retained.
- CORS, rate limiting, retries, and timeout retained.
- Section B evidence-gated learning context retained.

## Explicit M4-A limitations
- This checkpoint does not redesign the Tutor.
- No new model or AI endpoint is introduced.
- No database persistence is introduced.
- No M5 Mentor functionality is included.
- Formal M4 verification remains separate.

## M4-B — Tutor behavior/integration and giant-file hardening
- Candidate status: COMPLETE
- SSE event processor explicitly retained.
- Stream buffering corrected.
- Final unterminated SSE event is flushed.
- Streamed Markdown is sanitized before DOM insertion.
- Existing AI Tutor endpoint and Learning Context integration retained.
- No second Tutor endpoint or M5 functionality introduced.

## M4-C — Conversation persistence and recovery
- Candidate status: COMPLETE
- Saved conversation shape is validated and bounded.
- Text history restores after reload.
- Assistant history uses the existing safe Markdown renderer.
- User history uses textContent.
- Clear saved conversation control is available.
- Image bytes remain excluded from localStorage.

## M4-D — Final Tutor persistence/export hardening
- Candidate status: COMPLETE
- Conversation storage is schema-versioned and migration-safe.
- Storage failures surface an explicit status.
- Text-only conversation export/import is supported.
- Clear conversation is confirmable and keyboard accessible.
- No image bytes are persisted or exported.
- No new AI endpoint/model/database is introduced.

## Next
M4 formal verification — verify M4-A through M4-D together before promotion.

## Promotion
M4 formally verified and promoted/frozen. Next module: M5, subject to roadmap scope audit.
