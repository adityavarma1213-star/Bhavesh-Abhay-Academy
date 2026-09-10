#!/usr/bin/env node
// Grants the 'admin' role to an existing account by email. Run locally
// (with POSTGRES_URL set) — this is deliberately NOT a web-reachable
// endpoint, matching account.html's signup form, which intentionally
// never offers 'admin' as a self-service role.
//
// Usage: node scripts/grant-admin-role.mjs you@example.com
import { sql } from '../api/_lib/db.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/grant-admin-role.mjs <email>');
  process.exit(1);
}

const userRes = await sql`SELECT id, display_name FROM users WHERE email = ${email}`;
if (!userRes.rows.length) {
  console.error(`No account found with email ${email}. Sign up in the app first, then run this script.`);
  process.exit(1);
}
const user = userRes.rows[0];

const already = await sql`SELECT 1 FROM user_roles WHERE user_id = ${user.id} AND role = 'admin'`;
if (already.rows.length) {
  console.log(`${user.display_name} <${email}> already has the admin role. Nothing to do.`);
  process.exit(0);
}

await sql`INSERT INTO user_roles(user_id, role, granted_at) VALUES(${user.id}, 'admin', ${new Date().toISOString()})`;
console.log(`Granted admin role to ${user.display_name} <${email}>. They can now sign in and open admin.html.`);
