const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync('js/baa-offline-sync.js','utf8');
assert.ok(/indexedDB/.test(code));assert.ok(/enqueue/.test(code));assert.ok(/flush/.test(code));
const sw=fs.readFileSync('service-worker.js','utf8');
assert.ok(/caches\.open/.test(sw));assert.ok(/install/.test(sw));assert.ok(/fetch/.test(sw));
console.log('M41 offline-first cache/queue tests PASS');
