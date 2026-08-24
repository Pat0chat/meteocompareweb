import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const testsRoot = path.join(root, 'tests');
const allowedScopes = new Set(['unit', 'integration', 'regression', 'static', 'smoke']);

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collect(absolute);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [absolute] : [];
  });
}

const tests = collect(testsRoot);
assert.ok(tests.length > 0, 'the structured test tree must not be empty');

for (const absolute of tests) {
  const relative = path.relative(testsRoot, absolute).split(path.sep).join('/');
  const parts = relative.split('/');
  assert.equal(parts.length, 3, `${relative}: expected tests/<feature>/<scope>/<file>.test.mjs`);
  const [feature, scope, file] = parts;
  assert.match(feature, /^[a-z][a-z0-9-]*$/, `${relative}: feature directory must be stable and descriptive`);
  assert.ok(allowedScopes.has(scope), `${relative}: unsupported test scope ${scope}`);
  assert.match(file, /^[a-z0-9][a-z0-9.-]*\.test\.mjs$/, `${relative}: test filename must name its target/behavior`);
  assert.doesNotMatch(relative, /(?:^|[./-])release(?:[./-]|$)|\b\d{4,}\b/i, `${relative}: tests must not be organized by release/version identifiers`);
}

const rootLevelTests = fs.readdirSync(testsRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'));
assert.deepEqual(rootLevelTests, [], 'test scripts must live under a feature and scope directory');

console.log(`Structured test layout: OK (${tests.length} test files)`);
