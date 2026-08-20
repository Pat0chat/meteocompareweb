import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const version=read('VERSION').trim(),versionJs=read('js/version.js'),sw=read('sw.js'),app=read('js/app.js'),css=read('styles.css');
assert.equal(version,'1.10.16');
assert.match(versionJs,/APP_VERSION = '1\.10\.16'/);
assert.match(sw,/APP_VERSION = '1\.10\.16'/);
assert.match(sw,/CACHE_VERSION = 'v47-home-redesign'/);
const home=app.slice(app.indexOf('function homeConsensusWeights'),app.indexOf('function renderCityDetail'));
assert.match(home,/class="home-hero"/);
assert.match(home,/home-search-trigger/);
assert.match(home,/home-city-grid/);
assert.match(home,/home-mini-timeline/);
assert.match(home,/home-consensus-rail/);
assert.match(home,/homeWatchCandidate/);
assert.match(home,/home-watch-section/);
assert.doesNotMatch(home,/dashboard-kpis/);
assert.match(css,/\.home-city-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
assert.match(css,/@media \(max-width: 980px\)[\s\S]*?\.home-city-grid \{ grid-template-columns:1fr; \}/);
assert.match(css,/\.home-city-card:hover/);
assert.match(css,/\.home-consensus-rail/);
assert.match(css,/\.home-watch-grid/);
for(const lang of ['fr','en','es','de','it']){
  const locale=read(`js/locales/${lang}.js`);
  for(const key of ['homeModernTitle','homeSearchPrompt','homeConsensusTitle','homeWatchTitle','homeAgreementUnavailable','homeFamilyCountOne']) assert.match(locale,new RegExp(key));
}
console.log('MeteoCompare Web 1.10.16 home redesign: OK');
