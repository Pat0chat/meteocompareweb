import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=p=>fs.readFileSync(resolve(root,p),'utf8');
const app=read('js/app.js'),css=read('styles.css');
assert.match(app,/function homeForecastEngineContext\(cityId\)\{\s*return forecastEngineContext\(cityId\);/);
assert.match(app,/currentConditions\(f,new Date\(\),engineContext\)/);
assert.match(app,/cachedAggregateDay\(f,today,engineContext\)/);
assert.match(app,/homeTimelinePoints\(f,engineContext,5\)/);
assert.match(app,/aboutVisualStepEnginesTitle/);
assert.match(app,/aboutVisualEnginesKicker/);
assert.match(app,/about-visual-engine-grid/);
assert.match(app,/aboutVisualEngine\$\{key\}Short/);
assert.match(app,/renderGlobalAgreementCard\(f,agg,city\.id,consensusProfile\)\}\$\{renderForecastEngineCompareAction\(\)\}\$\{renderScenarios\(scenarios\)/);
assert.doesNotMatch(app,/forecast-engine-hero-action/);
assert.doesNotMatch(app,/function renderInsights\(/);
assert.match(css,/\.about-visual-engine-grid/);
assert.match(css,/\.forecast-engine-overview-action/);
for(const locale of ['fr','en','es','de','it']){
  const text=read(`js/locales/${locale}.js`);
  for(const key of ['aboutVisualStepEnginesTitle','aboutVisualStepEnginesBody','aboutVisualEnginesKicker','aboutVisualEngineMultiShort','aboutVisualEngineCalibrationShort','aboutVisualEngineScenariosShort','aboutVisualEngineAdaptiveShort','forecastEngineActiveLabel']) assert.ok(text.includes(`"${key}"`),`${locale} missing ${key}`);
}
console.log('Forecast Engines UI refinement: OK');
