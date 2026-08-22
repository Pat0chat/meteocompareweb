import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(resolve(root,p),'utf8');
const app=read('js/app.js'),css=read('styles.css');
const summary=app.slice(app.indexOf('function renderTodaySummary('),app.indexOf('function scenarioLabel('));
assert.match(summary,/hint:engineHintFor\('precipitation'\)/,'precipitation heading hint must only expose the effective V3 engine');
assert.doesNotMatch(summary,/rainHint|rainCore/,'precipitation probability and amount must not be duplicated below the heading');
const detail=app.slice(app.indexOf('function renderCityDetail('),app.indexOf('function diagnosticStatusLabel('));
assert.match(detail,/renderSeoDetailTitleContext\(city\).*detail-title-actions.*favorite-route-city/s,'SEO context and favorite action must stay in the title flow');
assert.doesNotMatch(detail,/detail-hero-actions">\$\{city\.seoTransient/,'favorite action must no longer live in the separate hero action rail');
assert.doesNotMatch(detail,/renderSeoCityContext\(city\)/,'standalone SEO context section must be removed');
assert.match(app,/forecast-engine-compare-card/,'engine comparison must be a dedicated themed card');
assert.match(app,/forecastEngineCompareIntro/);
assert.match(app,/renderForecastEngineLineChart/);
assert.match(app,/renderForecastEngineDivergenceTimeline/);
assert.match(app,/forecastEngineTempTrend/);
assert.match(app,/forecastEngineRainTrend/);
assert.match(app,/summary-dispersion-facts/,'summary metadata must be grouped into clean facts');
for(const cls of ['detail-seo-context','detail-title-actions','forecast-engine-compare-card','forecast-engine-chart-grid','forecast-engine-divergence-track','summary-dispersion-facts']) assert.ok(css.includes(`.${cls}`),`missing ${cls} styling`);
for(const locale of ['fr','en','es','de','it']){
  const text=read(`js/locales/${locale}.js`);
  for(const key of ['forecastEngineCompareIntro','forecastEngineVisualOverview','forecastEngineTempTrend','forecastEngineRainTrend','forecastEngineDivergenceTimeline','forecastEngineDivergenceLow','forecastEngineDivergenceMedium','forecastEngineDivergenceHigh','forecastEngineInspectDetails']) assert.ok(text.includes(`"${key}"`),`${locale} missing ${key}`);
}
console.log('MeteoCompare detail + Forecast Engines visual polish: OK');
