import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../js/version.js';
import { readProjectVersion } from '../tools/project-version.mjs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const canonical=read('app-version.js');
const runtime=read('js/version.js');
const sw=read('sw.js');
const build=read('tools/build-site.mjs');
const release=read('.github/workflows/release.yml');
const rollback=read('.github/workflows/rollback.yml');
const pkg=JSON.parse(read('package.json'));

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'canonical application version must use semantic x.y.z');
assert.equal(await readProjectVersion(),APP_VERSION,'Node tooling must resolve the same canonical version');
assert.match(canonical,/METEOCOMPARE_APP_VERSION\s*=\s*['"]\d+\.\d+\.\d+['"]/);
assert.match(runtime,/import '\.\.\/app-version\.js'/);
assert.match(runtime,/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/importScripts\('\.\/app-version\.js','\.\/cache-version\.js'\)/);
assert.match(sw,/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(build,/readProjectVersion/);
assert.match(build,/writeFile\(join\(out,'VERSION'\),`\$\{appVersion\}\\n`\)/,'deployment VERSION must be generated from the canonical source');
assert.match(release,/node tools\/project-version\.mjs/);
assert.match(rollback,/node tools\/project-version\.mjs/);
assert.equal(Object.hasOwn(pkg,'version'),false,'private package metadata must not duplicate the product version');
assert.equal(fs.existsSync(new URL('../VERSION',import.meta.url)),false,'source VERSION duplicate must not exist');

for(const file of fs.readdirSync(new URL('.',import.meta.url)).filter(name=>name.endsWith('.mjs'))){
  if(file==='app-version-centralized.mjs')continue;
  const source=read(`tests/${file}`);
  assert.doesNotMatch(source,/1\.15\.0/,`${file} must not hardcode the current product version`);
  assert.doesNotMatch(source,/readFileSync\([^\n]*['"]VERSION['"]|read\(['"]VERSION['"]\)/,`${file} must use the centralized runtime version instead of a duplicate VERSION file`);
}

console.log(`MeteoCompare Web ${APP_VERSION} centralized application version: OK`);
