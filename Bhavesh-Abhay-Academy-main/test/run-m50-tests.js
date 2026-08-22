#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-plugins.js','utf8'),c);
const api=c.window.BAAPlugins;
assert.ok(api);
assert.equal(c.window.BAAPlugins.validateManifest({id:'x',permissions:['bad'],entry:'https://x'}).error,'INVALID_PLUGIN_PERMISSION');
console.log('M50 PASS');
