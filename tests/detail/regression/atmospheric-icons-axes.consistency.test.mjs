import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weatherIcons} from '../../../js/ui/weather-icons.js';

const read=file=>readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css');
const summary=app.slice(app.indexOf('function renderTodaySummary('),app.indexOf('function renderScenarioRows('));
const columns=app.slice(app.indexOf('function renderTimelinePoint('),app.indexOf('function timelineEventMarker('));
const chronology=app.slice(app.indexOf('function renderDetailChronoTimeline('),app.indexOf('function renderTimeline('));
const chart=app.slice(app.indexOf('function renderGraphicForecastView('),app.indexOf('function renderTodaySummary('));

// The same two dedicated pictograms must be used, not temperature or cloud substitutes.
for (const [key,cssClass] of [['dewPoint','dew-point'],['humidity','humidity']]) {
  for(const size of ['tiny','small','micro']){
    const icon=weatherIcons.renderMetric(key,{size});
    assert.match(icon, new RegExp(`wx-metric-${key}`));
    assert.match(icon,/<svg[^>]+viewBox="0 0 48 48"/);
    assert.ok(icon.includes('<path')||icon.includes('<circle'));
  }
  assert.match(summary,new RegExp(`iconKind:'${key}',iconClass:'${cssClass}'`),`summary ${key} icon`);
  assert.match(columns,new RegExp(`timeline-${cssClass}-metric[\\s\\S]*?renderMetric\\('${key}',\\{size:'tiny'\\}\\)`),`columns ${key} icon`);
  assert.match(chronology,new RegExp(`detail-chrono-row-label ${cssClass}[^\n]*renderMetric\\('${key}',\\{size:'small'\\}\\)`),`frise ${key} icon`);
  assert.match(chart,new RegExp(`graphic-legend[\\s\\S]*?renderMetric\\('${key}',\\{size:'tiny'\\}\\)`),`chart legend ${key} icon`);
}
assert.match(chart,/humidityAxisMarkup=axisMarkup\('humidity',[^;]*weatherIcons\.renderMetric\('humidity',\{size:'tiny'\}\)\)/);
// Single & dual axes consume the same outer gutter and blend with the plot.
assert.match(chart,/leftPad=120,rightPad=108/);
assert.match(chart,/style="width:\$\{leftPad\}px"/);
const single=css.match(/\.graphic-y-axis \{ --axis-left:(\d+)px; --axis-rail-offset:(\d+)px; \}/);
const rain=css.match(/\.graphic-y-axis\.rain \{ --axis-left:(\d+)px; --axis-rail-offset:(\d+)px; \}/);
const humidity=css.match(/\.graphic-y-axis\.humidity \{ --axis-color:#7281cc; --axis-left:(\d+)px; --axis-rail-offset:(\d+)px; \}/);
assert.ok(single&&rain&&humidity);
const [sStart,sRail]=single.slice(1).map(Number);
const [rStart,rRail]=rain.slice(1).map(Number);
const [hStart,hRail]=humidity.slice(1).map(Number);
assert.equal(sStart+sRail,hStart+hRail,'outer rails align across all plots');
assert.ok(rStart+rRail+7<hStart,'left rain tick labels never overlap humidity tick lane');
assert.ok(hStart+hRail+7<=120,'humidity marks fit in the fixed gutter');
assert.ok(120-(sStart+sRail)<=12,'no oversized empty transition between scale and plot');
assert.match(css,/\.graphic-sticky-axis-slot \{[^}]*background: linear-gradient\(90deg,[^}]+\}/);
assert.match(css,/\.graphic-sticky-rain-axes \{ background:linear-gradient\(90deg,[^}]+\}/);
assert.match(css,/\.graphic-sticky-axis-slot::after \{/);
console.log('Dedicated atmospheric icons, common axis edge, compact double scale: OK');
