import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/m18-school-calendar.js', import.meta.url), 'utf8');
const checks = [
  ['ICS export branch exists', /format.*ics/.test(source)],
  ['calendar content type is emitted', /text\/calendar/.test(source)],
  ['download filename is bounded', /baa-school-calendar\.ics/.test(source)],
  ['ICS escaping is implemented', /function escapeIcs/.test(source)],
  ['learner authorization precedes export', /requireLearnerAccess\(session, learnerId\)/.test(source)],
  ['export is audited', /school_calendar\.export\.ics/.test(source)],
  ['responses are private and uncached', /private, no-store/.test(source)],
];
let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`); failed += 1; }
}
if (failed) process.exit(1);
console.log(`M18 calendar contract: ${checks.length}/${checks.length} structural checks passed`);
