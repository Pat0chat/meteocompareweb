import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../../../js/version.js';

const read=path=>fs.readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),build=read('tools/build-site.mjs');

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/);
assert.doesNotMatch(app,/renderSeoCityDirectory|renderSeoNearby|data-city-list=/,'hydrated pages must not render the former France-centric city list blocks');
assert.doesNotMatch(app,/home-section-heading home-column-heading seo-directory-heading city-list-summary/,'home city-directory heading must be removed');
assert.doesNotMatch(app,/section section-card seo-nearby-section city-list-disclosure/,'detail nearby-city block must be removed');
assert.doesNotMatch(css,/\.seo-directory|\.seo-nearby-section|\.city-list-disclosure/,'obsolete city-list presentation CSS must be removed');
assert.doesNotMatch(build,/seo-directory city-list-disclosure|seo-nearby-section city-list-disclosure/,'pre-rendered pages must match the lean runtime layout');

console.log('tests/seo/regression/app.city-list-disclosure.test.mjs: OK');
