import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const file of ['api/m48-collaboration.js','api/m49-competitions.js','api/m50-plugins.js','db/migrations/019_m48_m49_m50_collaboration_competitions_plugins.sql','db/migrations/022_m48_collaboration_visibility.sql','js/baa-collaboration.js','js/baa-competitions.js','js/baa-plugins.js']) assert.equal(fs.existsSync(file),true,`${file} missing`);
const migration=fs.readFileSync('db/migrations/019_m48_m49_m50_collaboration_competitions_plugins.sql','utf8');
for(const table of ['collaboration_posts','collaboration_comments','competition_events','installed_plugins']) assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
const visibility=fs.readFileSync('db/migrations/022_m48_collaboration_visibility.sql','utf8');
assert.match(visibility,/ADD COLUMN IF NOT EXISTS class_id/);
assert.match(visibility,/collaboration_visibility_class_scope/);
const api=fs.readFileSync('api/m48-collaboration.js','utf8');
assert.match(api,/requireAuth/); assert.match(api,/export const config/); assert.match(api,/class_members/); assert.match(api,/CLASS_ACCESS_DENIED/); assert.match(api,/canReadPost/);
const client=fs.readFileSync('js/baa-collaboration.js','utf8');
assert.match(client,/data-comment/); assert.match(client,/visibility/); assert.match(client,/classId/); assert.match(client,/credentials:'include'/);
for(const file of ['api/m49-competitions.js','api/m50-plugins.js']){const src=fs.readFileSync(file,'utf8');assert.match(src,/requireAuth/);assert.match(src,/export const config/);}
console.log('M48-M50 structural + collaboration visibility contract checks passed.');
