import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanDirs = ['tests', 'tools'];
const offenders = [];

for (const dir of scanDirs) {
  const dirPath = path.join(root, dir);
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:mjs|js)$/.test(entry.name)) continue;
    const relative = path.posix.join(dir, entry.name);
    const source = await readFile(path.join(dirPath, entry.name), 'utf8');
    if (/new\s+URL\(import\.meta\.url\)\.pathname/.test(source)) offenders.push(relative);
  }
}

assert.deepEqual(
  offenders,
  [],
  `Use fileURLToPath(import.meta.url) for filesystem paths; URL pathname breaks Windows drive paths: ${offenders.join(', ')}`,
);

console.log('MeteoCompare Windows path portability tests: OK');
