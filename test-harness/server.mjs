// Minimal local harness that adapts Node's raw http server to the
// (req, res) shape Vercel's Node runtime gives to api/*.js handlers:
//   req.body   -> parsed JSON body
//   req.query  -> parsed query string + dynamic route segments
//   res.status(n).json(obj) / res.setHeader(...)
// This is NOT a claim that it perfectly replicates Vercel's runtime in
// every detail (e.g. no edge-function support, no automatic OPTIONS
// preflight handling beyond what each handler already does itself).
// It exists to let the *actual, unmodified* handler source in api/
// be exercised over *real* HTTP against a *real* PostgreSQL database,
// which is evidence the repository's own fake-SQL test harness cannot
// produce.
import http from 'node:http';
import { URL } from 'node:url';

import authHandler from '../api/auth/[...action].js';
import v1Handler from '../api/v1/[...route].js';
import healthHandler from '../api/health.js';

function adaptRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    req.body = await readBody(req);
    req.query = Object.fromEntries(url.searchParams.entries());
    adaptRes(res);

    if (url.pathname.startsWith('/api/auth/')) {
      const action = url.pathname.split('/').filter(Boolean)[2];
      req.query.action = action;
      return await authHandler(req, res);
    }
    if (url.pathname.startsWith('/api/v1/')) {
      const route = url.pathname.replace('/api/v1/', '').split('/').filter(Boolean);
      req.query.route = route;
      return await v1Handler(req, res);
    }
    if (url.pathname === '/api/health') {
      return await healthHandler(req, res);
    }
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No local route for ' + url.pathname } });
  } catch (e) {
    console.error('HARNESS_ERROR', e);
    try { res.status(500).json({ error: { code: 'HARNESS_ERROR', message: String(e && e.message || e) } }); } catch {}
  }
});

const PORT = process.env.PORT || 8991;
server.listen(PORT, () => console.log(`Local BAA API harness listening on http://localhost:${PORT}`));
