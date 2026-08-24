import fs from 'node:fs';
import assert from 'node:assert/strict';
import { APP_VERSION } from '../../../js/version.js';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const version=APP_VERSION,versionJs=read('js/version.js'),app=read('js/app.js'),css=read('styles.css'),sw=read('sw.js');

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'application version must come from the centralized semantic version');
assert.ok(versionJs.includes('APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION'));
assert.match(sw,/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');

assert.match(app,/sticky=\['data','settings','about','bias'\]\.includes\(state\.route\.name\)/,'model reliability detail must opt into the common sticky back navigation');
assert.match(app,/class="page-back-shell\$\{sticky\?' is-sticky':''\}"/,'secondary pages must keep using the common back shell');
assert.match(css,/\.page-back-shell\.is-sticky\s*\{[^}]*position:sticky[^}]*z-index:24/s,'sticky back shell must remain visible while scrolling');
assert.match(css,/\.page-back-shell\.is-sticky \.page-back-button\s*\{[^}]*min-height:48px[^}]*font-size:\.84rem/s,'sticky back action must use the larger presentation');

console.log(`MeteoCompare Web ${APP_VERSION} reliability back navigation: OK`);
