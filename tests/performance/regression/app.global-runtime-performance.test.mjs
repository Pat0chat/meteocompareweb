import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const app=read('js/app.js');
const i18n=read('js/i18n.js');
const radar=read('js/features/radar.js');
const cache=read('js/core/cache-registry.js');
const sw=read('sw.js');

// High-frequency pointer movement must be ignored before scheduling work when the
// pointer is not over an interactive chart, and repeated movement inside one
// chart bucket must not rewrite tooltip DOM every animation frame.
assert.match(app,/function handleChartPointerMoveScheduled\(e\)\{[\s\S]*e\.target\?\.closest\?\.\('svg\[data-hover-chart\]'\)[\s\S]*requestAnimationFrame/);
assert.match(app,/if\(hover\.lastIndex===index\)return;hover\.lastIndex=index;/);
assert.match(app,/if\(hover\)hover\.lastIndex=-1;/);

// Intl formatter construction is expensive. Runtime hot paths keep bounded
// formatter caches instead of allocating a formatter for each label/cell.
assert.match(cache,/this\.dateTimeFormatters=new Map\(\)/);
assert.match(app,/function dateTimeFormatter\(locale,options\)/);
assert.equal((app.match(/new Intl\.DateTimeFormat/g)||[]).length,1,'app must construct DateTimeFormat only through the shared runtime cache');
assert.match(i18n,/const numberFormatters = new Map\(\)/);
assert.equal((i18n.match(/new Intl\.NumberFormat/g)||[]).length,1,'i18n Android-format compatibility must reuse NumberFormat instances');
assert.match(radar,/const radarTimeFormatters=new Map\(\)/);
assert.equal((radar.match(/new Intl\.DateTimeFormat/g)||[]).length,1,'radar timestamp labels must reuse DateTimeFormat instances');

// Background work is scoped to the current weather route and cached forecast
// records already hydrated synchronously are not cloned/read a second time.
assert.match(app,/function viewTimeCities\(\)[\s\S]*state\.route\.name==='city'[\s\S]*state\.route\.name==='compare'/);
assert.match(app,/setInterval\(\(\)=>\{if\(!routeShowsWeatherActivity\(\)\)return;/);
assert.match(app,/if\(state\.forecasts\[city\.id\]\)\{await yieldToMainThread\(\);continue;\}/);
assert.match(app,/function warmCityFeatures\(\)\{void loadFeature\('bias'\);void loadFeature\('evolution'\);\}/,'feature warmup must not trigger redundant full-page renders');

// Keep first service-worker installation light: lazy feature chunks are warmed
// after activation/idle rather than blocking install, while remaining available
// for offline use once the warmup completes.
assert.match(sw,/const OPTIONAL_SHELL = \[/);
const optional=sw.match(/const OPTIONAL_SHELL = \[([\s\S]*?)\];/)?.[1]||'';
const core=sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1]||'';
for(const feature of ['bias','evolution','comparison','marine','radar']){
  assert.ok(optional.includes(`./js/features/${feature}.js`),`${feature} must be staged in the optional offline shell`);
  assert.doesNotMatch(core,new RegExp(`js/features/${feature}\\.js`),`${feature} must not block core service-worker installation`);
}
assert.match(sw,/event\.data\?\.type!=='WARM_OPTIONAL_SHELL'/);
assert.match(app,/scheduleIdle\(\(\)=>void warmOptionalPwaShell\(\)\)/);

console.log('Global runtime performance and staged PWA warmup guards: OK');
