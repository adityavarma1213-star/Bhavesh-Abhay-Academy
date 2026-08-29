// M08 — structural contract for durable homework synchronization.
import fs from 'node:fs';

const files = {
  api: fs.readFileSync('api/v1/homework.js', 'utf8'),
  migration: fs.readFileSync('db/migrations/031_m08_homework_submissions.sql', 'utf8'),
  client: fs.readFileSync('js/baa-homework.js', 'utf8'),
};

const checks = [
  ['M08 API requires authentication', /requireAuth\(req\)/.test(files.api)],
  ['M08 API enforces learner access', /requireLearnerAccess\(session, learnerId\)/.test(files.api)],
  ['M08 API is no-store', /private, no-store, max-age=0/.test(files.api)],
  ['M08 API supports GET', /req\.method === 'GET'/.test(files.api)],
  ['M08 API supports PUT', /req\.method === 'PUT'/.test(files.api)],
  ['M08 API bounds submission count', /MAX_SUBMISSIONS = 100/.test(files.api)],
  ['M08 API bounds payload size', /MAX_JSON_BYTES/.test(files.api)],
  ['M08 API strips raw attachment data', /cleanAttachment/.test(files.api) && !/dataUrl|imageDataUrl/.test(files.api)],
  ['M08 API persists PostgreSQL rows', /INSERT INTO homework_submissions/.test(files.api)],
  ['M08 API records sync audit', /HOMEWORK_SUBMISSIONS_SYNCED/.test(files.api)],
  ['M08 migration stores learner ownership', /learner_id TEXT NOT NULL REFERENCES learners/.test(files.migration)],
  ['M08 migration uses JSONB payload', /payload JSONB NOT NULL/.test(files.migration)],
  ['M08 client uses authenticated sync', /credentials:'include'/.test(files.client)],
  ['M08 client uses fresh sync', /cache:'no-store'/.test(files.client)],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  if (!ok) failed += 1;
}
console.log(`M08 durable sync contract: ${checks.length - failed}/${checks.length}`);
process.exitCode = failed ? 1 : 0;
