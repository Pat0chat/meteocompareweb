import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fetchModelRunMetadata } from '../js/features/model-health.js';
import { WEATHER_MODELS } from '../js/models.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const version=read('VERSION').trim();
const app=read('js/app.js');
const models=read('js/models.js');
const versionJs=read('js/version.js');
const sw=read('sw.js');
const css=read('styles.css');

assert.ok(version.localeCompare('1.11.0',undefined,{numeric:true,sensitivity:'base'})>=0,`unexpected release version ${version}`);
assert.ok(versionJs.includes(`APP_VERSION = '${version}'`));
assert.ok(sw.includes(`APP_VERSION = '${version}'`));
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');

const homeStart=app.indexOf('function renderHome()');
const homeEnd=app.indexOf('function renderHeatmap(',homeStart);
const home=app.slice(homeStart,homeEnd);
assert.ok(homeStart>=0&&homeEnd>homeStart);
assert.doesNotMatch(home,/renderHomeConsensusStrip|home-consensus-rail|home-model-dot/);
assert.doesNotMatch(css,/\.home-consensus-rail|\.home-model-dot/);

const summaryStart=app.indexOf('function summaryDispersionCard(');
const summaryEnd=app.indexOf('function renderInsights(',summaryStart);
const summary=app.slice(summaryStart,summaryEnd);
assert.ok(summaryStart>=0&&summaryEnd>summaryStart);
assert.match(summary,/summary-dispersion-grid/);
assert.match(summary,/summary-model-dot/);
assert.match(summary,/summary-dispersion-envelope/);
assert.match(summary,/modelConvergence/);
assert.match(summary,/modelRange/);
assert.match(summary,/rainProbabilityShort/);
assert.equal((summary.match(/summaryDispersionCard\(\{agg,/g)||[]).length,6); // helper signature + five metric calls
assert.doesNotMatch(summary,/class="summary-tile metric-/);
for(const selector of ['.summary-dispersion-grid','.summary-dispersion-rail','.summary-model-dot','.summary-agreement-track'])assert.ok(css.includes(selector),selector);

const marineStart=app.indexOf('function renderMarineSection(');
const marineEnd=app.indexOf('async function refreshMarineData(',marineStart);
const marine=app.slice(marineStart,marineEnd);
assert.ok(marineStart>=0&&marineEnd>marineStart);
assert.doesNotMatch(marine,/data-action="refresh-marine"/);
const detailStart=app.indexOf('function renderCityDetail(');
const detailEnd=app.indexOf('function renderTimeline(',detailStart);
const detail=app.slice(detailStart,detailEnd);
assert.match(detail,/detail-hero-actions/);
assert.match(detail,/data-refresh-city=.*refreshWeather/);
assert.match(detail,/city\.marineEnabled\?`<button class="btn tonal detail-refresh-action marine-hero-refresh" data-action="refresh-marine"/);

assert.match(models,/id:'GEM_GLOBAL'[^\n]*metadataKey:null/);
assert.match(models,/id:'BOM_ACCESS'[^\n]*metadataKey:null/);
const unsupported=WEATHER_MODELS.filter(m=>['GEM_GLOBAL','BOM_ACCESS'].includes(m.id));
assert.equal(unsupported.length,2);
let fetchCalls=0;
const previousFetch=globalThis.fetch;
globalThis.fetch=async()=>{fetchCalls++;throw new Error('metadata fetch must be skipped');};
try{
  const result=await fetchModelRunMetadata(unsupported,{timeoutMs:50});
  assert.equal(fetchCalls,0);
  for(const model of unsupported){
    assert.equal(result[model.id]?.skipped,true);
    assert.equal(result[model.id]?.error,'METADATA_NOT_PUBLISHED');
  }
} finally {
  globalThis.fetch=previousFetch;
}

console.log('MeteoCompare Web 1.11.x release guards: OK');
