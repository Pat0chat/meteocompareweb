import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const audit=read('tools/release-audit.mjs');
const workflow=read('.github/workflows/release.yml');

assert.equal(pkg.scripts['audit:release'],'node tools/release-audit.mjs');
assert.match(audit,/\['--check',file\]/,'the release gate must syntax-check every discovered JavaScript source');
assert.match(audit,/tools\/run-tests\.mjs/,'the release gate must execute the complete test runner');
assert.match(audit,/tools\/build-site\.mjs/,'the release gate must build the production site');
assert.match(audit,/broken documentation link/,'the release gate must reject broken local documentation links');
assert.match(audit,/Server-only modules leaked into the public build/,'the release gate must reject server-only public assets');
assert.match(audit,/SEO_CITIES\.length/,'the release gate must validate the generated city catalogue');
assert.match(workflow,/run: npm run audit:release/,'tagged releases must pass the reproducible release gate');

console.log('Pre-release audit gate and CI wiring: OK');
