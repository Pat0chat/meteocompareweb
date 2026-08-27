import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasTranslation } from '../../../js/i18n.js';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),build=read('tools/build-site.mjs');
const home=app.slice(app.indexOf('function homeForecastEngineContext'),app.indexOf('function renderCityDetail'));
const meta=app.slice(app.indexOf('function renderHomeForecastMeta'),app.indexOf('function archiveCallLabel'));

assert.match(meta,/selectedForecastModels\(\)/,'Home must expose the selected forecast models');
assert.match(meta,/selectedForecastFamilyCount\(models\)/,'Home forecast context must count independent model families');
assert.match(meta,/refreshIntervalLabel\(state\.settings\.refreshInterval\)/,'Home must surface the configured refresh cadence');
assert.match(meta,/homeLatestSync\(favorites\)/,'Home must surface the last forecast synchronization age');
assert.match(meta,/models\.slice\(0,4\)/,'Home must keep the primary model list intentionally short');
assert.match(meta,/home-hero-context-count/);
assert.match(meta,/home-hero-context-models/);
assert.match(meta,/home-hero-context-sync/);
assert.doesNotMatch(meta,/forecastEngineName|localWeighting|homeHeroEngine/,'Engine and weighting settings must stay out of the Home hero');
assert.doesNotMatch(meta,/home-hero-meta-grid|home-hero-meta-item|home-hero-method-row|home-hero-model-chip/,'Home hero must not reintroduce dashboard-like subcards');
assert.match(home,/renderHomeForecastMeta\(favorites\)/,'Home hero must render the forecast context');

assert.match(css,/\.home-hero-forecast-meta\s*\{[^}]*display:flex[^}]*font-size:\.74rem/s,'Forecast context must remain a lightweight inline rail');
assert.doesNotMatch(css,/\.home-hero-forecast-meta\s*\{[^}]*border:/s,'Forecast context must not look like a nested card');
assert.doesNotMatch(css,/\.home-hero-forecast-meta\s*\{[^}]*background:/s,'Forecast context must preserve the hero background instead of introducing another surface');
assert.match(css,/\.home-hero-context-models\s*\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/s,'Model names must stay discreet instead of becoming chips/cards');
assert.match(css,/@media \(max-width: 720px\)[\s\S]*?\.home-hero-forecast-meta \{ display:grid; grid-template-columns:auto minmax\(0,1fr\);/,'Forecast context must wrap cleanly on mobile');
assert.match(build,/home-hero-context-count/,'SEO prerender should reserve the same lightweight context rail to avoid layout shift');
assert.doesNotMatch(build,/home-hero-meta-grid|home-hero-model-chip|Multi-consensus|Pondération locale désactivée/,'SEO prerender must not restore the heavy metadata panel');

for(const pref of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']){
  for(const key of ['homeHeroForecastMetaAria','homeHeroLastSync','homeHeroWaitingSync','homeHeroMainModels','homeFamilyCount','homeFamilyCountOne'])
    assert.equal(hasTranslation(pref,key),true,`${pref}.${key} missing`);
}
console.log('Home lightweight forecast context: OK');
