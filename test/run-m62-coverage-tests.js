#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const matrixPath=path.join(root,'MODULE-62-COMPLETION-MATRIX.json');
if(!fs.existsSync(matrixPath)) throw new Error('MODULE-62-COMPLETION-MATRIX.json is missing');

const matrix=JSON.parse(fs.readFileSync(matrixPath,'utf8'));
const rows=Array.isArray(matrix)?matrix:(Array.isArray(matrix.modules)?matrix.modules:[]);
if(rows.length!==62) throw new Error(`Expected 62 module records, found ${rows.length}`);

const ids=rows.map(x=>Number(x.id??x.module??x.number));
const expected=Array.from({length:62},(_,i)=>i+1);
if(ids.some((id,i)=>id!==expected[i])) throw new Error('M62 coverage matrix must contain module IDs 1..62 in order');

for(const row of rows){
  if(!row.status) throw new Error(`Module ${row.module??row.id} is missing a status`);
}

console.log('M62 coverage gate: 62/62 module records present and structurally valid.');
