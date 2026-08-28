#!/usr/bin/env node
const fs = require('fs');
const assert = require('assert');
const root = require('path').resolve(__dirname, '..');
const api = fs.readFileSync(require('path').join(root, 'api/m35-community-posts.js'), 'utf8');
const client = fs.readFileSync(require('path').join(root, 'js/baa-community.js'), 'utf8');
const migration = fs.readFileSync(require('path').join(root, 'db/migrations/029_m35_community_posts.sql'), 'utf8');
const checks = [
  ['migration creates community_posts', /CREATE TABLE IF NOT EXISTS community_posts/i.test(migration)],
  ['posts are owned by authenticated user', /author_user_id TEXT NOT NULL REFERENCES users\(id\)/i.test(migration)],
  ['post body is persisted', /body TEXT NOT NULL/i.test(migration)],
  ['visible status is constrained', /status TEXT NOT NULL DEFAULT 'visible'/i.test(migration)],
  ['API requires authentication', /requireAuth\(req\)/.test(api)],
  ['API supports authenticated GET', /req\.method === 'GET'/.test(api)],
  ['API supports authenticated POST', /req\.method === 'POST'/.test(api)],
  ['server safety filter exists', /POST_BLOCKED_BY_SAFETY_FILTER/.test(api)],
  ['server persists posts', /INSERT INTO community_posts/.test(api)],
  ['server writes audit event', /COMMUNITY_POST_CREATED/.test(api)],
  ['API prevents caching', /private, no-store, max-age=0/.test(api)],
  ['client sends authenticated credentials', /credentials:'include'/.test(client)],
  ['client forces fresh transport', /cache:'no-store'/.test(client)],
  ['client requests JSON', /Accept:'application\/json'/.test(client)],
  ['client exposes secure create', /createPostSecure/.test(client)],
  ['client exposes secure list', /listPostsSecure/.test(client)],
];
let failed=0; for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+' '+name); if(!ok) failed++;}
if(failed) process.exit(1); console.log(`M35 server-post contract: ${checks.length}/${checks.length} checks defined.`);
