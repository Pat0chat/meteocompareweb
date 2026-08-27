import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { APP_VERSION } from '../../../js/version.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=path=>fs.readFileSync(resolve(root,path),'utf8');
const version=APP_VERSION;
const app=read('js/app.js');
const css=read('styles.css');
const build=read('tools/build-site.mjs');
const pkg=JSON.parse(read('package.json'));

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'application version must come from the centralized semantic version');
assert.match(app,/class="seo-directory city-list-disclosure"[\s\S]*?<summary class="home-section-heading home-column-heading seo-directory-heading city-list-summary"/,'Explorer heading must use a compact disclosure summary outside the city-list card');
assert.match(app,/class="section-card seo-directory-card"><p class="seo-directory-intro"/,'only the SEO directory body should remain inside the card');
assert.doesNotMatch(app,/class="section-card seo-directory"/,'SEO directory heading must not be inside the card');
assert.match(app,/a\[data-seo-city-link\]/,'SEO links must be intercepted for in-app navigation');
assert.match(app,/e\.preventDefault\(\);if\(openSeoCityLink\(seoLink\)\)return/,'normal SEO link clicks must avoid a hard navigation');
assert.match(app,/!e\.metaKey&&!e\.ctrlKey&&!e\.shiftKey&&!e\.altKey/,'modified link clicks must keep native browser behavior');
assert.match(css,/\.seo-directory\[open\] \.seo-directory-heading\{margin-bottom:var\(--space-4\)\}/);
assert.match(build,/home-section-heading home-column-heading seo-directory-heading/,'pre-rendered home must match hydrated heading hierarchy');
assert.equal(pkg.scripts.preview,'node tools/preview-site.mjs','a clean-URL local preview command must be available');

execFileSync(process.execPath,['tools/build-site.mjs'],{cwd:root,stdio:'pipe'});
const home=read('dist/index.html');
assert.match(home,/<details class="seo-directory city-list-disclosure"><summary class="home-section-heading home-column-heading seo-directory-heading city-list-summary">/);
assert.match(home,/data-seo-city-link="toulouse" href="\/meteo\/toulouse"/);
assert.ok(fs.existsSync(resolve(root,'dist/meteo/toulouse.html')),'Toulouse prerender must still be emitted as an extension-backed clean URL asset');

console.log(`MeteoCompare Web SEO home/routing polish ${APP_VERSION}: OK`);
