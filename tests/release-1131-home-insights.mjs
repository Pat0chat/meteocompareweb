import fs from 'node:fs';
import assert from 'node:assert/strict';
import { APP_VERSION } from '../js/version.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),sw=read('sw.js');

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);
assert.doesNotMatch(app,/function renderInsights\(/,'À retenir is intentionally removed from City Details');
assert.doesNotMatch(app,/insights-section insights-section-wide/,'À retenir markup must not remain');
assert.doesNotMatch(css,/\.insights-section-wide\s*\{/,'obsolete À retenir styling must be removed');
assert.match(app,/overview-secondary">\$\{renderGlobalAgreementCard\([^}]+\)\}\$\{renderForecastEngineCompareAction\(\)\}\$\{renderScenarios\(/,'engine comparison belongs between convergence and scenarios');
assert.match(app,/function homeForecastEngineContext\(cityId\)\{\s*return forecastEngineContext\(cityId\);/,'Home must reuse the same forecast-engine context as City Details');
console.log(`MeteoCompare Web ${APP_VERSION} detail-noise cleanup + forecast-engine home context: OK`);
