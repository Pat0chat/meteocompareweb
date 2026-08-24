import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
for(const rel of ['.github/workflows/pages.yml','.github/workflows/release.yml','.github/workflows/rollback.yml']){
  const source=fs.readFileSync(path.join(root,rel),'utf8');
  const cleanup=source.indexOf('rm -f js/android_strings.js');
  assert.ok(cleanup>=0,`${rel}: obsolete translation catalog cleanup missing`);
  const testRun=source.indexOf('npm run tests');
  assert.ok(testRun<0||cleanup<testRun,`${rel}: obsolete runtime cleanup must run before tests`);
}
console.log('tests/deployment/static/workflows.cleanup-order.test.mjs: OK');
