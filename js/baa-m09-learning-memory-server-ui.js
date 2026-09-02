/* BAA M09 — server-backed Learning Memory surface.
 * The server endpoint is canonical for this panel; local intelligence is not
 * presented as persisted server truth.
 */
(function (global) {
  'use strict';
  const MAX_RESPONSE_BYTES = 1024 * 1024;
  async function readJsonResponse(response) {
    const declared = Number(response?.headers?.get?.('content-length') || 0);
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      try { response.body?.cancel?.(); } catch (_) {}
      throw new Error('M09_RESPONSE_TOO_LARGE');
    }
    if (!response?.body || typeof response.body.getReader !== 'function') {
      try {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error('M09_RESPONSE_TOO_LARGE');
        return JSON.parse(text);
      } catch (error) {
        if (error?.message === 'M09_RESPONSE_TOO_LARGE') throw error;
        throw new Error('M09_INVALID_RESPONSE');
      }
    }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let bytes = 0; let text = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          try { await reader.cancel(); } catch (_) {}
          throw new Error('M09_RESPONSE_TOO_LARGE');
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      try { return JSON.parse(text); } catch (_) { throw new Error('M09_INVALID_RESPONSE'); }
    } finally { try { reader.releaseLock(); } catch (_) {} }
  }
  function esc(v) { const d = document.createElement('div'); d.textContent = String(v ?? ''); return d.innerHTML; }
  function learnerId() { return String(global.BAA_LEARNER_ID || '').trim(); }

  async function load(id = learnerId()) {
    if (!id) return null;
    const r = await fetch('/api/m09-learning-memory?learnerId=' + encodeURIComponent(id), { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
    let p;
    try { p = await readJsonResponse(r); } catch (error) { throw error; }
    if (!r.ok) throw new Error('M09_' + r.status);
    if (!p?.ok) throw new Error('M09_INVALID');
    return p;
  }

  function mount() {
    const path = String(global.location.pathname || '');
    if (!path.endsWith('/student-os.html')) return;
    if (document.getElementById('baaM09ServerMemory')) return;
    const host = document.querySelector('#content') || document.querySelector('main') || document.body;
    if (!host) return;
    const panel = document.createElement('section');
    panel.id = 'baaM09ServerMemory';
    panel.className = 'card';
    panel.innerHTML = '<h2 class="section-h" style="margin-top:0">🧠 Learning Memory</h2><div class="empty-note">Loading authenticated server learning memory…</div>';
    host.appendChild(panel);

    load().then(data => {
      if (!data) {
        panel.querySelector('.empty-note').textContent = 'Sign in with a learner account to view server-backed Learning Memory.';
        return;
      }
      const s = data.summary || {};
      const rows = (data.concepts || []).slice(0, 12).map(c => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(253,249,240,.06)"><span><b>${esc(c.conceptLabel)}</b><small style="display:block;color:var(--faint)">${esc(c.subject)} · ${esc(c.topic)}</small></span><span>${esc(c.state.replace(/_/g,' '))} · ${c.evidenceCount} evidence</span></div>`).join('');
      panel.innerHTML = `<h2 class="section-h" style="margin-top:0">🧠 Learning Memory</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">
          <div class="pstat"><b>${s.totalEvidence || 0}</b><span>Evidence</span></div>
          <div class="pstat"><b>${s.trackedConcepts || 0}</b><span>Concepts</span></div>
          <div class="pstat"><b>${s.mastered || 0}</b><span>Mastered</span></div>
          <div class="pstat"><b>${s.needsRevision || 0}</b><span>Needs revision</span></div>
          <div class="pstat"><b>${s.struggling || 0}</b><span>Struggling</span></div>
        </div>
        <div style="margin-top:14px"><b>Server-backed concept history</b>${rows || '<div class="empty-note">No persisted academic evidence is available yet.</div>'}</div>
        <p style="font-size:.68rem;color:var(--faint);margin-top:10px">This panel uses authenticated learner-scoped PostgreSQL evidence. Missing evidence is not treated as weakness, and this feature does not infer psychological traits.</p>`;
    }).catch((error) => {
      panel.querySelector('.empty-note').textContent = error?.message === 'M09_RESPONSE_TOO_LARGE'
        ? 'Server Learning Memory response exceeded the safe response limit.'
        : 'Server Learning Memory is unavailable. No browser-local profile is substituted as server-backed data.';
    });
  }

  global.BAAM09LearningMemoryServer = { load, mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})(window);
