import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_VERSION } from '../js/version.js';
const read=p=>fs.readFileSync(p,'utf8');
const version=APP_VERSION,versionJs=read('js/version.js'),sw=read('sw.js'),app=read('js/app.js'),appState=read('js/core/app-state.js'),comparison=read('js/features/comparison.js'),css=read('styles.css');
assert.ok(version.localeCompare('1.10.15',undefined,{numeric:true,sensitivity:'base'})>=0);
assert.match(versionJs,/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
// Version is discreetly visible beside the brand and detailed on About.
assert.match(app,/class="brand-title-row"/);
assert.match(app,/class="brand-version"/);
assert.match(app,/versionInfoLabel/);
assert.match(app,/DATA_SCHEMA_VERSION/);
assert.match(css,/\.brand-version\s*\{/);
for(const lang of ['fr','en','es','de','it']) assert.match(read(`js/locales/${lang}.js`),/versionInfoLabel/);
// Targeted model picker keeps its UI open state independently from selected count.
assert.match(appState,/comparePanelOpen=\{\}/);
assert.match(app,/\[data-target-compare\]/);
assert.match(app,/toggle-target-compare/);
assert.match(app,/state\.comparePanelOpen\[key\]=next/);
assert.match(app,/panel\.dataset\.open/);
assert.match(comparison,/data-target-compare/);
assert.match(comparison,/targetCompareOpen/);
assert.match(comparison,/isOpen=targetCompareOpen\?\?selected\.length>=2/);
console.log('MeteoCompare Web 1.10.15 version + comparison persistence: OK');
