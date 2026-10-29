import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=name=>readFileSync(new URL(`../../../${name}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css');
const home=app.slice(app.indexOf('function renderCityCard(city){'),app.indexOf('function renderCityComparisonLazy('));
assert.match(home,/homeCityPlaceLine\(city\)/,'loaded and empty home cards include region and country');
assert.match(app,/function homeCityPlaceLine\(city\)[\s\S]*city\?\.region\|\|city\?\.admin1/,'explicit region with admin1 fallback');
const summary=app.slice(app.indexOf('function renderTodaySummary('),app.indexOf('function renderScenarioRows('));
for(const key of ["key:'dewPoint'","key:'humidity'","t('dewPoint')","t('relativeHumidity')"]){assert.ok(summary.includes(key),`summary ${key}`);}
const point=app.slice(app.indexOf('function renderTimelinePoint('),app.indexOf('function timelineEventMarker('));
for(const value of ['timeline-dew-point-metric','timeline-humidity-metric','dewPointC','relativeHumidityPercent'])assert.ok(point.includes(value),`column ${value}`);
const chrono=app.slice(app.indexOf('function renderDetailChronoTimeline('),app.indexOf('function renderTimeline('));
for(const value of ['detail-chrono-dew-point','detail-chrono-humidity','detail-chrono-row-label dew-point','detail-chrono-row-label humidity'])assert.ok(chrono.includes(value),`chrono ${value}`);
const graph=app.slice(app.indexOf('function renderGraphicForecastView('),app.indexOf('function renderTodaySummary('));
for(const value of ['graphic-dew-point-line','graphic-humidity-line','data-graphic-ruler-dew','data-graphic-ruler-humidity',"t('dewPoint')","t('relativeHumidity')"]){assert.ok(graph.includes(value),`graphic ${value}`);}
for(const value of ['graphic-dew-point-line','graphic-humidity-line','detail-chrono-atmosphere-cell','--detail-chrono-atmosphere-height'])assert.ok(css.includes(value),`CSS ${value}`);
assert.match(graph,/point\.dewPointC\)\?\{x:x\(index\),y:yTemp\(point\.dewPointC\)/,'dew-point line uses temperature scale');
assert.match(graph,/humidityAxis=graphicBoundedRange\(humidityValues,\{minimumSpan:10,targetTicks:4,minBound:0,maxBound:100/,'humidity uses its own bounded adaptive scale');
assert.match(graph,/yHumidity=value=>rainBottom-\(Math\.max\(humidityAxis\.min,Math\.min\(humidityAxis\.max,value\)\)-humidityAxis\.min\)\/humiditySpan\*\(rainBottom-rainTop\)/,'humidity path follows the dynamic axis');
assert.match(graph,/y:yHumidity\(point\.relativeHumidityPercent\)/,'humidity series uses the labeled percentage axis');
for(const locale of ['fr','en','es','de','it']){
  const catalog=read(`js/locales/${locale}.js`);
  assert.ok(catalog.includes('"dewPoint"')&&catalog.includes('"relativeHumidity"'),`${locale} catalogue`);
}
console.log('Localized home, summary, columns, chronology, graphs and ruler atmospheric metrics: OK');
