import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webTranslationAudit } from '../js/i18n.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),sw=read('sw.js'),version=read('VERSION').trim();
const slice=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
const settings=slice('function renderSettings(){','function modelGroups(');
const local=slice('function renderLocalDataPage(){','function renderSettings(){');
const about=slice('function renderAbout(){','function renderHome(){');

assert.ok(/^1\.10\.(?:1[1-9]|[2-9]\d+)$/.test(version),`unexpected release version ${version}`);
assert.match(sw,/const APP_VERSION = '1\.10\.(?:1[1-9]|[2-9]\d+)'/);
assert.match(sw,/const CACHE_VERSION = 'v\d+[-a-z0-9]+'/);

// Settings: four clear logical sections, no redundant eyebrow in the page renderer.
assert.match(settings,/settingsInterfaceTitle/);
assert.match(settings,/settingsForecastTitle/);
assert.match(settings,/history-management/);
assert.match(settings,/weatherModels/);
assert.match(settings,/settings-control-grid/);
assert.doesNotMatch(settings,/class="eyebrow"|section-eyebrow/);

// Local data: three primary storage signals, advanced diagnostics collapsed by default.
assert.match(local,/storage-kpis-simple/);
assert.match(local,/storageAdvancedTitle/);
assert.match(local,/storageConfigGroup/);
assert.match(local,/storageWeatherGroup/);
assert.match(local,/storageAnalysisGroup/);
assert.match(local,/<details class="section-card storage-section storage-advanced"[^>]*>/);
assert.match(local,/renderIntegritySection\(\)/);
assert.match(local,/renderApiUsageSection\(\)/);
assert.doesNotMatch(local,/class="eyebrow"|section-eyebrow/);

// About: method + three reading cues + concise data/install blocks; legacy help-card wall removed.
assert.match(about,/about-method-flow/);
assert.match(about,/about-reading-grid/);
assert.match(about,/aboutConvergenceTitle/);
assert.match(about,/aboutHistoryTitle/);
assert.match(about,/aboutRawTitle/);
assert.match(about,/about-install-grid/);
assert.match(about,/aboutAgreementCallout/);
assert.doesNotMatch(about,/help-grid|about-intro-card/);

assert.match(css,/\.settings-control-grid/);
assert.match(css,/\.storage-advanced>summary/);
assert.match(css,/\.about-reading-grid/);
assert.match(css,/\.about-install-grid/);

const audit=webTranslationAudit();
for(const lang of ['fr','en','es','de','it']) assert.deepEqual(audit[lang],[],`missing translation in ${lang}`);
for(const lang of ['fr','en','es','de','it']){
  const {catalog}=await import(`../js/locales/${lang}.js?clarity=${Date.now()}`);
  for(const key of ['settingsInterfaceTitle','settingsForecastTitle','storageAdvancedTitle','aboutIndicatorsTitle','aboutConvergenceTitle','aboutHistoryTitle','aboutRawTitle','aboutInstallTitle','storageConfigGroup','storageWeatherGroup','storageAnalysisGroup','learnMore']){
    assert.ok(typeof catalog[key]==='string'&&catalog[key].trim(),`${lang}:${key} missing`);
  }
  for(const key of ['settingsIntro','localDataIntro','aboutLead']) assert.ok(catalog[key].length<=180,`${lang}:${key} too verbose`);
}
console.log('MeteoCompare Web clarity pages 1.10.10: OK');
