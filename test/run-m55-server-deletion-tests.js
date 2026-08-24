#!/usr/bin/env node
'use strict';

/* M55 contract gate.
 * This static gate verifies that the repository contains the complete
 * server-side deletion path: authenticated endpoint + transactional DB
 * function + session invalidation + explicit confirmation.
 * It does NOT claim that a live production database has been exercised.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const endpoint = fs.readFileSync(path.join(root, 'api', 'account', 'delete.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'db', 'migrations', '015_account_deletion.sql'), 'utf8');

const checks = [
  ['endpoint requires authentication', /requireAuth\(req\)/.test(endpoint)],
  ['endpoint does not accept a client-selected user id', !/req\.body\??\.userId|query\??\.userId/.test(endpoint)],
  ['destructive action requires explicit confirmation', /DELETE MY ACCOUNT/.test(endpoint)],
  ['endpoint calls transactional database deletion function', /baa_delete_user_account/.test(endpoint)],
  ['endpoint clears the session cookie', /Set-Cookie/.test(endpoint) && /Max-Age=0/.test(endpoint)],
  ['migration defines account deletion function', /CREATE OR REPLACE FUNCTION baa_delete_user_account/.test(migration)],
  ['migration deletes user-owned learners first', /DELETE FROM learners WHERE user_id = p_user_id/.test(migration)],
  ['migration deletes the authenticated user', /DELETE FROM users WHERE id = p_user_id/.test(migration)],
  ['migration returns deletion evidence', /jsonb_build_object/.test(migration)],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  if (!ok) failed++;
}

console.log(`M55 server deletion contract: ${checks.length - failed}/${checks.length} checks passed.`);
process.exit(failed ? 1 : 0);
