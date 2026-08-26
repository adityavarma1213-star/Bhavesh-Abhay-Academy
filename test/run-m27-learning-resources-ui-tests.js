#!/usr/bin/env node
const fs=require('fs');
const assert=require('assert');
const files={
 bridge:fs.readFileSync('js/baa-m27-learning-resources-server.js','utf8'),
 ui:fs.readFileSync('js/baa-m27-learning-resources-ui.js','utf8'),
 catalogue:fs.readFileSync('js/baa-guide-catalogue.js','utf8')
};
const checks=[
 ['server bridge exports BAAM27Server',/global\.BAAM27Server\s*=/.test(files.bridge)],
 ['server request uses credentials',/credentials:\s*['"]include['"]/.test(files.bridge)],
 ['ui bridge exports BAAM27LearningResourcesUI',/global\.BAAM27LearningResourcesUI\s*=/.test(files.ui)],
 ['ui exposes format choices',/visual.*video.*interactive.*practice/s.test(files.ui)],
 ['ui consumes server bridge',/BAAM27Server\.getServerRecommendations/.test(files.ui)],
 ['ui renders recommendations',/baa-m27-resource-list/.test(files.ui)],
 ['ui links external destinations safely',/noopener noreferrer/.test(files.ui)],
 ['ui states external resources are not BAA-validated',/not BAA-validated resources/.test(files.ui)],
 ['shared bootstrap loads M27 server bridge',/baa-m27-learning-resources-server\.js/.test(files.catalogue)],
 ['shared bootstrap loads M27 UI bridge',/baa-m27-learning-resources-ui\.js/.test(files.catalogue)]
];
let passed=0;for(const [name,ok] of checks){assert.ok(ok,name);passed++;console.log('PASS',name);}console.log(`M27 UI contract: ${passed}/${checks.length}`);
