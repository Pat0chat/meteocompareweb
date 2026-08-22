import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const version=read('VERSION').trim();
const app=read('js/app.js');
const css=read('styles.css');
const versionJs=read('js/version.js');
const sw=read('sw.js');

assert.ok(version.localeCompare('1.11.1',undefined,{numeric:true,sensitivity:'base'})>=0);
assert.ok(versionJs.includes(`APP_VERSION = '${version}'`));
assert.ok(sw.includes(`APP_VERSION = '${version}'`));
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');

const detail=app.slice(app.indexOf('function renderCityDetail('),app.indexOf('function diagnosticStatusLabel('));
const weatherIndex=detail.indexOf('detail-refresh-action\" data-refresh-city');
const marineIndex=detail.indexOf('detail-refresh-action marine-hero-refresh');
assert.ok(weatherIndex>=0 && marineIndex>weatherIndex,'marine refresh must sit below weather refresh');
assert.match(detail,/btn-icon \$\{loading\?'spinning'/);
assert.match(detail,/btn-icon \$\{state\.marineLoading\.has\(city\.id\)\?'spinning'/);

const summary=app.slice(app.indexOf('function summaryDispersionCard('),app.indexOf('function renderInsights('));
assert.doesNotMatch(summary,/summary-dispersion-chip/);
assert.match(summary,/summary-dispersion-meta-item/);
assert.match(summary,/summary-agreement-label/);
assert.match(summary,/summary-agreement-track/);
assert.match(css,/\.summary-context-chips > span[\s\S]*border:0/);
assert.match(css,/\.summary-dispersion-meta-item/);

const timeline=app.slice(app.indexOf('function renderTimelinePoint('),app.indexOf('function timelineEventMarker('));
assert.doesNotMatch(timeline,/confidencePill\(/);
assert.doesNotMatch(timeline,/class=\"pill/);
assert.match(timeline,/timeline-temp-track/);
assert.match(timeline,/timeline-consensus-line/);
assert.match(timeline,/timeline-consensus-track/);
assert.match(timeline,/timeline-consensus-meta/);
assert.match(css,/\.timeline-temp-track/);
assert.match(css,/\.timeline-consensus-track/);
assert.match(css,/\.divergence-list span,[\s\S]*border:0/);

console.log('MeteoCompare Web 1.11.1 release guards: OK');
