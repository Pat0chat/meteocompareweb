import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { APP_VERSION } from '../js/version.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>fs.readFileSync(resolve(root,path),'utf8');

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'application version must come from the centralized semantic version');
assert.match(read('js/version.js'),/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(read('sw.js'),/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(read('sw.js'),/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
assert.match(read('cache-version.js'),/METEOCOMPARE_CACHE_VERSION = 'v\d+[-a-z0-9]+'/);

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

console.log(`MeteoCompare Web ${APP_VERSION} SEO release and nested-route assets: OK`);
