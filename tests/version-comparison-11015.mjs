import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const version=read('VERSION').trim(),versionJs=read('js/version.js'),sw=read('sw.js'),app=read('js/app.js'),comparison=read('js/features/comparison.js'),css=read('styles.css');
assert.equal(version,'1.10.15');
assert.match(versionJs,/APP_VERSION = '1\.10\.15'/);
assert.match(sw,/APP_VERSION = '1\.10\.15'/);
assert.match(sw,/CACHE_VERSION = 'v46-version-compare'/);
// Version is discreetly visible beside the brand and detailed on About.
assert.match(app,/class="brand-title-row"/);
assert.match(app,/class="brand-version"/);
assert.match(app,/versionInfoLabel/);
assert.match(app,/DATA_SCHEMA_VERSION/);
assert.match(css,/\.brand-version\s*\{/);
for(const lang of ['fr','en','es','de','it']) assert.match(read(`js/locales/${lang}.js`),/versionInfoLabel/);
// Targeted model picker keeps its UI open state independently from selected count.
assert.match(app,/comparePanelOpen:\s*\{\}/);
assert.match(app,/details\[data-target-compare\]/);
assert.match(app,/state\.comparePanelOpen\[key\]=compareDetails\.open/);
assert.match(app,/state\.comparePanelOpen\[key\]=panel\.open/);
assert.match(comparison,/data-target-compare/);
assert.match(comparison,/targetCompareOpen/);
assert.match(comparison,/isOpen=targetCompareOpen\?\?selected\.length>=2/);
console.log('MeteoCompare Web 1.10.15 version + comparison persistence: OK');
