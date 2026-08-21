import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>fs.readFileSync(resolve(root,path),'utf8');

assert.equal(read('VERSION').trim(),'1.14.0');
assert.match(read('js/version.js'),/APP_VERSION = '1\.14\.0'/);
assert.match(read('sw.js'),/APP_VERSION = '1\.14\.0'/);
assert.match(read('sw.js'),/CACHE_VERSION = 'v71-seo-release-1140'/);

const index=read('index.html');
assert.match(index,/rel="icon" href="assets\/icon\.png"/);
assert.match(index,/rel="apple-touch-icon" href="assets\/icon\.png"/);
assert.match(index,/rel="manifest" href="manifest\.webmanifest"/);
assert.match(index,/rel="stylesheet" href="styles\.css"/);
assert.match(index,/type="module" src="js\/app\.js"/);

const app=read('js/app.js');
assert.match(app,/const APP_ROOT_URL=new URL\('\.\.\/',import\.meta\.url\)/,'runtime assets must resolve from the application module location');
assert.match(app,/class="logo" src="\$\{attr\(appAssetUrl\('assets\/icon\.png'\)\)\}"/,'topbar logo must use the route-independent asset resolver');
assert.doesNotMatch(app,/class="logo" src="assets\/icon\.png"/,'topbar logo must not depend on the current document route depth');

execFileSync(process.execPath,['tools/build-site.mjs'],{cwd:root,stdio:'pipe'});
const toulouse=read('dist/meteo/toulouse.html');
assert.match(toulouse,/<base href="\/" \/>/);
assert.match(toulouse,/rel="icon" href="assets\/icon\.png"/);
assert.match(toulouse,/type="module" src="js\/app\.js"/);
assert.ok(fs.existsSync(resolve(root,'dist/assets/icon.png')),'release build must contain the topbar icon');

console.log('MeteoCompare Web 1.14.0 SEO release and nested-route assets: OK');
