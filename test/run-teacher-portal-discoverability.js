#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const themeEngine=fs.readFileSync(new URL('../js/baa-themes.js',import.meta.url),'utf8');
const studentOs=fs.readFileSync(new URL('../student-os.html',import.meta.url),'utf8');
const studentWiring=fs.readFileSync(new URL('../js/baa-student-wiring-m21-23-33.js',import.meta.url),'utf8');
const account=fs.readFileSync(new URL('../account.html',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../teacher-portal.html',import.meta.url),'utf8');

assert.match(themeEngine,/fetch\('\/api\/auth\/me'/,'OS navigation must resolve the authenticated role from the server');
assert.match(themeEngine,/includes\('teacher'\).*includes\('admin'\)/,'Teacher/admin roles must be explicitly recognized');
assert.match(themeEngine,/href='teacher-portal\.html'/,'Authenticated teacher/admin users must receive a Teacher Portal link');
assert.match(studentOs,/baa-student-wiring-m21-23-33\.js/,'Student OS must load the live wiring layer used for portal discoverability');
assert.match(studentWiring,/id='baa-teacher-portal-entry'/,'Student OS wiring must create a stable Teacher/Academic Management entry id');
assert.match(studentWiring,/aria-label','Teacher and academic management'/,'Teacher entry must expose an accessible label');
assert.match(studentWiring,/href='account\.html\?role=teacher'/,'Teacher entry must route through the authenticated account flow');
assert.match(studentWiring,/data-role','teacher'/,'Teacher entry must identify the intended role');
assert.match(studentWiring,/Open Teacher Portal/,'Teacher entry must expose an explicit user-facing CTA');
assert.match(account,/teacher-portal\.html/,'Account page must retain a direct Teacher / Academic Management route');
assert.match(portal,/Teacher \/ Academic Setup/,'Teacher portal must expose the academic-management workspace');
assert.match(portal,/\/api\/syllabus/,'Teacher portal must use the server-backed syllabus API');

console.log('Teacher Portal discoverability checks passed.');
