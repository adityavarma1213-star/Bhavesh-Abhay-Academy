#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from '@vercel/postgres';
const root=process.cwd();
const schema=await fs.readFile(path.join(root,'db/schema.sql'),'utf8');
await sql.query(schema);
const dir=path.join(root,'db/migrations');
for(const file of (await fs.readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){
  const text=await fs.readFile(path.join(dir,file),'utf8');
  await sql.query(text);
  console.log('Applied',file);
}
console.log('BAA database schema/migrations applied.');
