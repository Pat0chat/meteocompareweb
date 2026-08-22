import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = path.join(ROOT, 'tests');

const tests = (await readdir(TESTS_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'en'));

if (tests.length === 0) {
  console.error('No test files found in tests/*.mjs');
  process.exit(1);
}

const failures = [];
console.log(`Running ${tests.length} test files...`);

for (const [index, test] of tests.entries()) {
  const relativePath = path.posix.join('tests', test);
  console.log(`\n[${index + 1}/${tests.length}] ==> ${relativePath}`);

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(TESTS_DIR, test)], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        console.error(`${relativePath} terminated by signal ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) failures.push(relativePath);
}

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length}/${tests.length} test file(s) failed:`);
  for (const test of failures) console.error(`- ${test}`);
  process.exit(1);
}

console.log(`All ${tests.length} test files passed.`);
