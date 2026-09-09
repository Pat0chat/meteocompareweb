import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasTranslation } from '../../../js/i18n.js';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css');
const home=app.slice(app.indexOf('function homeTimelinePoints'),app.indexOf('function renderCityDetail'));

assert.match(home,/home-weather-axis-condition/,'Every hourly x-axis slot must expose its weather condition');
assert.match(home,/aggregateConditionMarkup\(point,'tiny'\)/,'Hourly conditions must render the aggregate condition with consensus provenance');
assert.match(home,/conditionInfo\.label/,'Timeline tooltips must include the localized condition label');
assert.match(home,/home-temperature-line/,'Temperature must be represented by a graph line');
assert.match(home,/gradientId=`home-temp-gradient-/,'Temperature graph must namespace its heatmap gradient');
assert.match(home,/<linearGradient id=\"\$\{attr\(gradientId\)\}\"/,'Temperature graph must render the heatmap gradient in SVG');
assert.match(home,/groupRainTimelineEvents\(points\)/,'Rain must be converted into grouped timeline events');
assert.match(home,/home-weather-rain-hour/,'Rain signal must expose an aligned hourly probability lane');
assert.match(home,/homeRainProbabilityValue/,'Rain signal must expose explicit rain probability semantics');
assert.match(home,/amountLabel=isWetPrecipitation\(amount\)/,'Rain signal must expose conditional amount when rain is possible');
assert.doesNotMatch(home,/home-weather-timeline-legend/,'The compact home timeline must not retain a redundant legend');
assert.doesNotMatch(home,/home-weather-event-title/,'The redundant rain lane title must stay removed');
assert.match(css,/\.home-weather-axis-condition\s*\{/);
assert.match(css,/\.home-weather-axis-condition \.condition-icon \.wx-icon\s*\{[^}]*width:1\.28rem/s);
assert.match(css,/\.home-temperature-plot\s*\{[^}]*height:92px/s,'Temperature graph must retain enough vertical room to show trend and labels');
assert.match(css,/\.home-weather-rain-track\s*\{[^}]*display:grid;[^}]*grid-template-columns:repeat\(var\(--home-timeline-cols\),minmax\(0,1fr\)\);[^}]*min-height:40px/s,'Rain signal must remain aligned with the hourly x-axis');
assert.match(css,/\.home-weather-rain-hour\.is-wet\s*\{[^}]*--rain-wet-top/s,'Rain cells must encode probability through visual intensity');

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
console.log('Home graphical timeline + contextual action toasts: OK');
