#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const bridge=fs.readFileSync('js/baa-m48-collaboration-server.js','utf8');
const catalogue=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
for(const token of ['BAAM48Server','credentials:\'include\'','createServerPost','commentServerPost','reportServerPost','moderateServerPost'])assert.ok(bridge.includes(token),`M48 bridge missing ${token}`);
assert.ok(catalogue.includes("js/baa-m48-collaboration-server.js"));
console.log('M48 client bridge PASS (7/7 structural checks)');
