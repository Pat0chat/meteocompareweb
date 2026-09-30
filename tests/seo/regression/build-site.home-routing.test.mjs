import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { APP_VERSION } from '../../../js/version.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=path=>fs.readFileSync(resolve(root,path),'utf8');
const app=read('js/app.js');
const build=read('tools/build-site.mjs');
const pkg=JSON.parse(read('package.json'));

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'application version must come from the centralized semantic version');
assert.doesNotMatch(app,/seo-directory city-list-disclosure|seo-nearby-section city-list-disclosure/,'runtime must not render the removed city-list sections');
assert.doesNotMatch(app,/data-seo-city-link/,'removed city-list links must leave no dead click handler behind');
assert.doesNotMatch(build,/home-section-heading home-column-heading seo-directory-heading|seo-nearby-section city-list-disclosure/,'pre-rendered pages must not reintroduce removed city-list sections');
assert.equal(pkg.scripts.preview,'node tools/preview-site.mjs','a clean-URL local preview command must be available');

execFileSync(process.execPath,['tools/build-site.mjs'],{cwd:root,stdio:'pipe'});
const home=read('dist/index.html');
assert.doesNotMatch(home,/seo-directory|city-list-summary/,'pre-rendered home must stay compact');
assert.ok(fs.existsSync(resolve(root,'dist/meteo/toulouse.html')),'Toulouse prerender must still be emitted as an extension-backed clean URL asset');
const toulouse=read('dist/meteo/toulouse.html');
assert.doesNotMatch(toulouse,/seo-nearby-section|city-list-summary/,'pre-rendered details must not contain nearby-city UI');

console.log(`MeteoCompare Web compact SEO routing ${APP_VERSION}: OK`);
