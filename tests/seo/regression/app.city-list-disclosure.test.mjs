import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../../../js/version.js';

const read=path=>fs.readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),build=read('tools/build-site.mjs'),fr=read('js/locales/fr.js');

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/);
assert.match(app,/function cityListCollapseKey\(kind\)/,'city-list visibility must be persisted through settings');
assert.match(app,/data-city-list=\"popular\"/,'home city directory must use a disclosure');
assert.match(app,/data-city-list=\"nearby\"/,'detail nearby cities must use a disclosure');
assert.match(app,/typeof stored==='boolean'\?stored:true/,'secondary city lists must be collapsed by default');
assert.match(app,/setCityListCollapsed\(cityListDetails\.dataset\.cityList,!cityListDetails\.open\)/,'native details toggles must persist their state');
assert.match(css,/\.city-list-disclosure > summary/);
assert.match(css,/\.city-list-disclosure\[open\] \.city-list-chevron/);
assert.match(build,/<details class=\"seo-directory city-list-disclosure\">/,'pre-rendered home must avoid flashing the full city directory');
assert.match(build,/<details class=\"section-card seo-nearby-section city-list-disclosure\">/,'pre-rendered detail must keep nearby cities collapsed initially');
assert.match(fr,/\"showCityList\":\"Afficher les villes\"/);
assert.match(fr,/\"hideCityList\":\"Masquer les villes\"/);

console.log('tests/seo/regression/app.city-list-disclosure.test.mjs: OK');
