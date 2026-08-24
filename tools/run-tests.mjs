import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = path.join(ROOT, 'tests');

async function discoverTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const discovered = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'fixtures' || entry.name === 'helpers') continue;
      discovered.push(...await discoverTests(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      discovered.push(absolutePath);
    }
  }
  return discovered;
}

function parseArgs(argv) {
  const options = { feature: null, scope: null, file: null, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') {
      options.list = true;
      continue;
    }
    if (['--feature', '--scope', '--file'].includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node tools/run-tests.mjs [options]\n\nOptions:\n  --feature <name>  Run one feature directory (for example radar or marine)\n  --scope <name>    Run one scope (unit, integration, regression, static, smoke)\n  --file <text>     Run test files whose basename contains <text>\n  --list            List matching tests without executing them\n`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const tests = (await discoverTests(TESTS_DIR))
  .map((absolutePath) => ({
    absolutePath,
    relativePath: path.relative(ROOT, absolutePath).split(path.sep).join('/'),
  }))
  .filter(({ relativePath, absolutePath }) => {
    const [, feature, scope] = relativePath.split('/');
    if (options.feature && feature !== options.feature) return false;
    if (options.scope && scope !== options.scope) return false;
    if (options.file && !path.basename(absolutePath).includes(options.file)) return false;
    return true;
  })
  .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'));

if (tests.length === 0) {
  console.error('No matching test files found under tests/<feature>/<scope>/*.test.mjs');
  process.exit(1);
}

if (options.list) {
  for (const test of tests) console.log(test.relativePath);
  process.exit(0);
}

const filters = [
  options.feature && `feature=${options.feature}`,
  options.scope && `scope=${options.scope}`,
  options.file && `file~${options.file}`,
].filter(Boolean);
const filterLabel = filters.length ? ` (${filters.join(', ')})` : '';
console.log(`Running ${tests.length} test files${filterLabel}...`);

const failures = [];
for (const [index, test] of tests.entries()) {
  console.log(`\n[${index + 1}/${tests.length}] ==> ${test.relativePath}`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [test.absolutePath], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        console.error(`${test.relativePath} terminated by signal ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) failures.push(test.relativePath);
}

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length}/${tests.length} test file(s) failed:`);
  for (const test of failures) console.error(`- ${test}`);
  process.exit(1);
}

console.log(`All ${tests.length} test files passed.`);
