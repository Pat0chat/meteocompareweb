import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const version=read('VERSION').trim(),versionJs=read('js/version.js'),app=read('js/app.js'),css=read('styles.css'),sw=read('sw.js');

assert.equal(version,'1.14.0');
assert.ok(versionJs.includes("APP_VERSION = '1.14.0'"));
assert.match(sw,/APP_VERSION = '1\.14\.0'/);
assert.ok(Number(sw.match(/CACHE_VERSION = 'v(\d+)/)?.[1]||0)>=67,'1.14.0 cache generation must not regress below v67');

assert.match(app,/sticky=\['data','settings','about','bias'\]\.includes\(state\.route\.name\)/,'model reliability detail must opt into the common sticky back navigation');
assert.match(app,/class="page-back-shell\$\{sticky\?' is-sticky':''\}"/,'secondary pages must keep using the common back shell');
assert.match(css,/\.page-back-shell\.is-sticky\s*\{[^}]*position:sticky[^}]*z-index:24/s,'sticky back shell must remain visible while scrolling');
assert.match(css,/\.page-back-shell\.is-sticky \.page-back-button\s*\{[^}]*min-height:48px[^}]*font-size:\.84rem/s,'sticky back action must use the larger presentation');

console.log('MeteoCompare Web 1.14.0 reliability back navigation: OK');
