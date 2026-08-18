import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),comparison=read('js/features/comparison.js'),css=read('styles.css'),api=read('js/api.js'),storage=read('js/storage.js'),sw=read('sw.js');

// 1 — desktop tables: sticky header + first column.
assert.match(css,/\.forecast-table thead th \{ position:sticky; top:0;/,'table headers must remain visible');
assert.match(css,/\.forecast-table th:first-child,[\s\S]*position:sticky; left:0;/,'first table column must remain visible');

// 2 — targeted 2–4 model comparison.
assert.match(comparison,/export function renderTargetedModelComparison/,'targeted model comparison must exist in its lazy module');
assert.match(app,/import\('\.\/features\/comparison\.js'\)/,'comparison module must be lazy loaded');
assert.match(app,/targetedComparisonMax4/,'comparison must enforce the 4-model limit through i18n');
assert.match(comparison,/data-compare-model=/,'model comparison selector must be interactive');

// 3 — disagreement analysis by variable.
assert.match(app,/function disagreementAnalysis/,'disagreement analysis must be computed');
assert.match(app,/names=\{TEMPERATURE:t\('temperature'\),PRECIPITATION:t\('precipitation'\),WIND:t\('wind'\),CONDITION:t\('conditions'\)\}/,'disagreement modal must break down all four variables through i18n');
assert.match(app,/data-agreement-time=/,'agreement timeline must open analysis at an échéance');

// 4 — run/data freshness, honest when exact run is unavailable.
assert.match(api,/function modelRunTimestamp/,'API normalization must attempt to retain run metadata');
assert.doesNotMatch(app,/t\('runExactUnavailable'\)/,'tables should not repeat an unhelpful exact-run-unavailable label');
assert.match(app,/function modelRunInfo/,'per-model freshness metadata must be rendered');

// 5 — shareable URL state.
assert.match(app,/function syncCityViewUrl/,'view state must be serializable into the URL');
assert.match(app,/q\.set\('tab'/,'URL must encode table variable');
assert.match(app,/q\.set\('mode'/,'URL must encode daily-hourly mode');
assert.match(app,/q\.set\('h'/,'URL must encode graph horizon');
assert.match(app,/q\.set\('models'/,'URL must encode targeted model selection');
assert.match(app,/data-action="copy-link"/,'share action must be available');

// 6 — local CSV / JSON export.
assert.match(app,/function exportCityData/,'export feature must exist');
assert.match(app,/data-export-format="csv"/,'CSV export must be exposed');
assert.match(app,/data-export-format="json"/,'JSON export must be exposed');
assert.match(app,/temperatureBias[\s\S]*precipitationBias[\s\S]*windBias/,'exports must include local bias diagnostics');

// 7 — compare 2 or 3 cities.
assert.match(app,/name:'compare'/,'city comparison must have a dedicated route');
assert.match(comparison,/export function renderCityComparison/,'city comparison page must exist in its lazy module');
assert.match(app,/cityComparisonMax3/,'city comparison must enforce the 3-city limit through i18n');

// 8 — visible cache/offline age.
assert.match(app,/function forecastHealth/,'cache health classification must exist');
assert.match(app,/offlineOldCache/,'stale offline cache must be explicit through i18n');
assert.match(app,/class="city-context-bar"/,'city context bar must expose data state');

// 9 — incremental bias-history reconstruction.
assert.match(app,/function biasRefreshPlan/,'bias refresh cost must be planned before requesting archives');
assert.match(app,/function contiguousDateRanges/,'missing days must be grouped into exact ranges');
assert.match(app,/historyRefreshConfirm/,'confirmation must explain incremental behavior through i18n');
assert.match(app,/plan\.forecastRanges[\s\S]*plan\.observationRanges/,'refresh must request only missing ranges');

// 10 — visual density / compact workspace.
assert.match(storage,/density: 'COMFORTABLE'/,'density preference must have a stable default');
assert.match(app,/data-density=/,'density must be configurable');
assert.match(css,/html\[data-density="compact"\]/,'compact visual mode must alter layout density');
assert.ok(Number(sw.match(/CACHE_VERSION\s*=\s*['"]v(\d+)/)?.[1] || 0) >= 18, 'PWA cache version must not regress below v18');

console.log('MeteoCompare Web analysis feature tests: OK');
