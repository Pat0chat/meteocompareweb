import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasTranslation } from '../../../js/i18n.js';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css');
const home=app.slice(app.indexOf('function homeForecastEngineContext'),app.indexOf('function renderCityDetail'));

assert.match(home,/home-mini-condition/,'Each compact hourly slot must expose a condition area');
assert.match(home,/conditionMarkup\(condition,'tiny',Boolean\(point\.conditionInferred\)\)/,'Compact timeline must render the semantic weather icon for each point');
assert.match(home,/conditionInfo\.label/,'Timeline tooltips must include the localized condition label');
assert.match(css,/\.home-mini-condition\s*\{/);
assert.match(css,/\.home-mini-condition \.condition-icon \.wx-icon\s*\{[^}]*width:1\.45rem/s);
assert.match(css,/\.home-mini-hour \{[^}]*grid-template-rows:auto 24px auto auto auto/s,'Timeline layout must reserve a dedicated row for conditions');

assert.match(app,/homeCityAddedLoading[\s\S]*type:'loading'/,'Adding a city should provide progress feedback');
assert.match(app,/homeCityAddedSuccess[\s\S]*type:'success'/,'Adding a city should update its toast on completion');
assert.match(app,/homeCityRemoved[\s\S]*homeCityRemovedTitle/,'Removing a city should be confirmed by toast');
assert.match(app,/forecastEngineChangedToast/,'Forecast engine changes should be surfaced by toast');
assert.match(app,/refreshIntervalChangedToast/,'Refresh cadence changes should be surfaced by toast');
assert.match(app,/modelSelectionUpdatedDetailed/,'Model selection toast should expose models and family count');
assert.match(app,/automaticRefreshPartialToast/,'Background refresh failures should be surfaced without noisy success notifications');

for(const pref of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']){
  for(const key of ['homeCityAddedLoading','homeCityAddedSuccess','homeCityRemoved','forecastConfigToastTitle','forecastEngineChangedToast','refreshIntervalChangedToast','modelSelectionUpdatedDetailed','automaticRefreshPartialToast'])
    assert.equal(hasTranslation(pref,key),true,`${pref}.${key} missing`);
}
console.log('Home timeline conditions + contextual action toasts: OK');
