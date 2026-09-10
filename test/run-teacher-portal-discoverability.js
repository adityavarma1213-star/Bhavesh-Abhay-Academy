#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const themeEngine=fs.readFileSync(new URL('../js/baa-themes.js',import.meta.url),'utf8');
const account=fs.readFileSync(new URL('../account.html',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../teacher-portal.html',import.meta.url),'utf8');

assert.match(themeEngine,/fetch\('\/api\/auth\/me'/,'OS navigation must resolve the authenticated role from the server');
assert.match(themeEngine,/includes\('teacher'\).*includes\('admin'\)/,'Teacher/admin roles must be explicitly recognized');
assert.match(themeEngine,/href='teacher-portal\.html'/,'Authenticated teacher/admin users must receive a Teacher Portal link');
assert.match(account,/teacher-portal\.html/,'Account page must retain a direct Teacher / Academic Management route');
assert.match(portal,/Teacher \/ Academic Setup/,'Teacher portal must expose the academic-management workspace');
assert.match(portal,/\/api\/syllabus/,'Teacher portal must use the server-backed syllabus API');

console.log('Teacher Portal discoverability checks passed.');
