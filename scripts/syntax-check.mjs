import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const ignored = new Set(['node_modules', '.git', '.vercel']);
const jsFiles = [];
const htmlFiles = [];

async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile()) {
      if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) jsFiles.push(full);
      if (entry.name.endsWith('.html')) htmlFiles.push(full);
    }
  }
}

await walk(root);
let failures = 0;

function checkNodeSyntax(file, source) {
  const tmp = path.join(os.tmpdir(), `baa-syntax-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  return fs.writeFile(tmp, source).then(() => {
    const result = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    return fs.unlink(tmp).then(() => ({ result, file }));
  });
}

for (const file of jsFiles) {
  const source = await fs.readFile(file, 'utf8');
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures++;
    console.error(`\n[JS SYNTAX ERROR] ${path.relative(root, file)}\n${result.stderr || result.stdout}`);
  }
}

for (const file of htmlFiles) {
  const html = await fs.readFile(file, 'utf8');
  const matches = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  let index = 0;
  for (const match of matches) {
    const attrs = match[0].slice(0, match[0].indexOf('>') + 1);
    if (/\bsrc\s*=\s*/i.test(attrs)) continue;
    const source = match[1];
    if (!source.trim()) continue;
    index++;
    const checked = await checkNodeSyntax(file, source);
    if (checked.result.status !== 0) {
      failures++;
      console.error(`\n[INLINE JS SYNTAX ERROR] ${path.relative(root, file)} <script #${index}>\n${checked.result.stderr || checked.result.stdout}`);
    }
  }
}

console.log(`BAA syntax audit: ${jsFiles.length} JS/MJS files + ${htmlFiles.length} HTML files inspected.`);
if (failures) {
  console.error(`BAA syntax audit failed with ${failures} error(s).`);
  process.exit(1);
}
console.log('BAA syntax audit passed.');
