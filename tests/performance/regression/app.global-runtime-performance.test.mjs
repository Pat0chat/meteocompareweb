import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const app=read('js/app.js');
const i18n=read('js/i18n.js');
const radar=read('js/features/radar.js');
const cache=read('js/core/cache-registry.js');
const sw=read('sw.js');
const apiBudget=read('js/api-budget.js');
const domain=read('js/domain.js');
const css=read('styles.css');

// High-frequency pointer movement must be ignored before scheduling work when the
// pointer is not over an interactive chart, and repeated movement inside one
// chart bucket must not rewrite tooltip DOM every animation frame.
assert.match(app,/function handleChartPointerMoveScheduled\(e\)\{[\s\S]*e\.target\?\.closest\?\.\('svg\[data-hover-chart\]'\)[\s\S]*requestAnimationFrame/);
assert.match(app,/if\(hover\.lastIndex===index\)return;hover\.lastIndex=index;/);
assert.match(app,/const ROUTE_SCROLL_CACHE_LIMIT = 64;/);
assert.match(app,/while\(routeScrollPositions\.size>ROUTE_SCROLL_CACHE_LIMIT\)routeScrollPositions\.delete/,'route scroll restoration cache must stay bounded');
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


// Repeated home rerenders (messages, modals, connectivity) must not recompute every
// forecast card. Card HTML is memoized per forecast/settings/minute and bounded.
assert.match(app,/homeCards:new Map\(\)/);
assert.match(app,/cache\.homeCards\.has\(cacheKey\)/);
assert.match(app,/if\(cache\.homeCards\.size>=4\)cache\.homeCards\.clear\(\)/);

// Expensive Intl helpers must be reused instead of recreated for every city/age label.
assert.match(cache,/this\.displayNames=new Map\(\)/);
assert.equal((app.match(/new Intl\.DisplayNames/g)||[]).length,1,'country names must use one cached DisplayNames per locale');
assert.match(domain,/const relativeTimeFormatters\s*=\s*new Map\(\)/);
assert.equal((domain.match(/new Intl\.RelativeTimeFormat/g)||[]).length,1,'relative-age labels must reuse RelativeTimeFormat instances');

// The request cache is bounded and budget accounting performs one read/modify/write
// transaction instead of two synchronous localStorage parses per network attempt.
assert.match(apiBudget,/const MEMORY_CACHE_MAX_ENTRIES=48/);
assert.match(apiBudget,/function consumeBudget\(category,url\)/);
assert.doesNotMatch(apiBudget,/function assertBudget\(/);
assert.doesNotMatch(apiBudget,/function increment\(category,url\)/);
assert.match(apiBudget,/while\(memoryCache\.size>=MEMORY_CACHE_MAX_ENTRIES\)memoryCache\.delete/);

// Large below-the-fold detail sections should be skipped by layout/paint until they
// approach the viewport; the forecast summary/timeline above the fold stay eager.
for(const id of ['agreement','evolution','reliability','details','marine'])assert.match(css,new RegExp(`\.detail-main > #${id} \{[^}]*content-visibility:auto[^}]*contain-intrinsic-size:auto`, 's'));
assert.doesNotMatch(css,/\.detail-workspace \.section \{[^}]*content-visibility:\s*visible/s);

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
for(const lang of ['en','es','de','it']){
  assert.ok(optional.includes(`./js/locales/${lang}.js`),`${lang} locale must be staged after activation`);
  assert.doesNotMatch(core,new RegExp(`js/locales/${lang}\\.js`),`${lang} locale must not block first service-worker installation`);
}
assert.ok(core.includes('./js/locales/fr.js'),'French fallback locale stays in the core offline shell');
assert.match(sw,/event\.data\?\.type!=='WARM_OPTIONAL_SHELL'/);
assert.match(app,/scheduleIdle\(\(\)=>void warmOptionalPwaShell\(\)\)/);

console.log('Global runtime performance and staged PWA warmup guards: OK');
