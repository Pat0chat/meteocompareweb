import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>fs.readFileSync(resolve(root,path),'utf8');
const version=read('VERSION').trim();
const app=read('js/app.js');
const css=read('styles.css');
const build=read('tools/build-site.mjs');
const pkg=JSON.parse(read('package.json'));

assert.equal(version,'1.14.0','home/SEO routing polish must not change app version');
assert.match(app,/class="seo-directory" aria-labelledby="seo-popular-cities"><div class="home-section-heading home-column-heading seo-directory-heading"/,'Explorer heading must use the same outside-card heading system as the home columns');
assert.match(app,/class="section-card seo-directory-card"><p class="seo-directory-intro"/,'only the SEO directory body should remain inside the card');
assert.doesNotMatch(app,/class="section-card seo-directory"/,'SEO directory heading must not be inside the card');
assert.match(app,/a\[data-seo-city-link\]/,'SEO links must be intercepted for in-app navigation');
assert.match(app,/e\.preventDefault\(\);if\(openSeoCityLink\(seoLink\)\)return/,'normal SEO link clicks must avoid a hard navigation');
assert.match(app,/!e\.metaKey&&!e\.ctrlKey&&!e\.shiftKey&&!e\.altKey/,'modified link clicks must keep native browser behavior');
assert.match(css,/\.seo-directory-heading\{margin-bottom:var\(--space-4\)\}/);
assert.match(build,/home-section-heading home-column-heading seo-directory-heading/,'pre-rendered home must match hydrated heading hierarchy');
assert.equal(pkg.scripts.preview,'node tools/preview-site.mjs','a clean-URL local preview command must be available');

execFileSync(process.execPath,['tools/build-site.mjs'],{cwd:root,stdio:'pipe'});
const home=read('dist/index.html');
assert.match(home,/<section class="seo-directory"><div class="home-section-heading home-column-heading seo-directory-heading">/);
assert.match(home,/data-seo-city-link="toulouse" href="\/meteo\/toulouse"/);
assert.ok(fs.existsSync(resolve(root,'dist/meteo/toulouse.html')),'Toulouse prerender must still be emitted as an extension-backed clean URL asset');

console.log('MeteoCompare Web SEO home/routing polish 1.14.0: OK');
