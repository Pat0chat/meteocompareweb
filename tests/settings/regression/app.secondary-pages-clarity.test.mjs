import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webTranslationAudit } from '../../../js/i18n.js';
import { APP_VERSION } from '../../../js/version.js';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),sw=read('sw.js'),version=APP_VERSION;
const slice=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
const settings=slice('function renderSettings(){','function modelGroups(');
const local=slice('function renderLocalDataPage(){','function renderSettings(){');
const about=slice('function renderAbout(){','function renderHome(){');

assert.match(sw,/const APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);

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

// About: one visual pedagogical flow + concise practical/community blocks; installation is centralized in the topbar.
assert.match(about,/about-method-flow/);
assert.match(about,/about-visual-steps/);
assert.match(about,/about-visual-engine-grid/);
assert.match(about,/about-visual-consensus/);
assert.match(about,/about-visual-agreement-grid/);
assert.match(about,/about-visual-radar-frames/);
assert.match(about,/about-visual-dashboard/);
assert.match(about,/about-visual-takeaways/);
assert.match(about,/about-community/);
assert.doesNotMatch(about,/about-install|aboutInstallTitle|aboutInstallBody/);
assert.match(about,/aboutAgreementCallout/);
assert.doesNotMatch(about,/help-grid|about-intro-card/);

assert.match(css,/\.settings-control-grid/);
assert.match(css,/\.storage-advanced>summary/);
assert.match(css,/\.about-visual-step/);
assert.match(css,/\.about-visual-takeaways/);
assert.match(css,/\.about-community/);
assert.doesNotMatch(css,/\.about-install(?:-grid|-head)?/);

const audit=webTranslationAudit();
for(const lang of ['fr','en','es','de','it']) assert.deepEqual(audit[lang],[],`missing translation in ${lang}`);
for(const lang of ['fr','en','es','de','it']){
  const {catalog}=await import(`../../../js/locales/${lang}.js?clarity=${Date.now()}`);
  for(const key of ['settingsInterfaceTitle','settingsForecastTitle','storageAdvancedTitle','aboutVisualTitle','aboutVisualStepModelsTitle','aboutVisualStepEnginesTitle','aboutVisualStepConditionsTitle','aboutVisualStepAgreementTitle','aboutVisualStepRadarTitle','aboutVisualStepDecisionTitle','storageConfigGroup','storageWeatherGroup','storageAnalysisGroup','learnMore']){
    assert.ok(typeof catalog[key]==='string'&&catalog[key].trim(),`${lang}:${key} missing`);
  }
  for(const key of ['settingsIntro','localDataIntro','aboutLead']) assert.ok(catalog[key].length<=180,`${lang}:${key} too verbose`);
}
console.log('tests/settings/regression/app.secondary-pages-clarity.test.mjs: OK');
