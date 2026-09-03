import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../../../.github/workflows/release.yml',import.meta.url),'utf8');
const validate=workflow.indexOf('Validate tag and application version');
const audit=workflow.indexOf('npm run audit:release');
const packageStep=workflow.indexOf('Build release archive');
assert.ok(validate>=0&&audit>validate&&packageStep>audit,'release packaging must happen only after tag/version validation and the complete release audit');
for(const entry of ['dist','_site','release','.git','.github','tests']){
  assert.ok(workflow.includes(`--exclude '${entry}'`),`release ZIP must exclude ${entry}/`);
}
assert.match(workflow,/sha256sum "release\/\$\{ROOT\}\.zip"/,'release workflow must publish a checksum for the exact ZIP it creates');
console.log('Release workflow package hygiene: OK');
