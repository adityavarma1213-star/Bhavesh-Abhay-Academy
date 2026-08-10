#!/usr/bin/env node
// BAA G5 migration utility.
// Reads an exported localStorage JSON bundle and writes only the explicitly
// mapped learner-owned records. It never invents users/parent/teacher links.
import fs from 'node:fs/promises';
import { sql } from '@vercel/postgres';
import crypto from 'node:crypto';

const file=process.argv[2];
if(!file){console.error('Usage: node scripts/migrate-localstorage.mjs <export.json>');process.exit(2);}
const raw=JSON.parse(await fs.readFile(file,'utf8'));
const data=raw?.data||raw;
const now=new Date().toISOString();
const learnerId=data.learnerId||`learner_migrated_${crypto.randomBytes(6).toString('hex')}`;
const name=String(data.baa_student_name||'Migrated Student').trim().slice(0,120);
await sql`INSERT INTO learners(id,display_name,created_at,updated_at) VALUES(${learnerId},${name},${now},${now}) ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=EXCLUDED.updated_at`;
console.log(JSON.stringify({ok:true,learnerId,message:'Identity created/mapped. Continue with the mapped Section B/C/D records from the export.'},null,2));
