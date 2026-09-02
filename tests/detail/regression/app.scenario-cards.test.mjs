import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css');
const scenarios=app.slice(app.indexOf('function scenarioLabel('),app.indexOf('function renderTimeline('));
const renderer=scenarios.slice(scenarios.indexOf('function renderScenarioRows('),scenarios.indexOf('function renderScenarios('));
const section=scenarios.slice(scenarios.indexOf('function renderScenarios('));

assert.match(renderer,/visible\.map\(\(s,index\)=>/,'the first ranked scenario must be identifiable as the main scenario');
assert.match(renderer,/scenario-primary-badge/);
assert.match(renderer,/scenarioTimingMarkup\(s\)/,'wet scenarios must expose an early/middle/late timing ribbon');
assert.match(renderer,/scenario-weight-track/,'family support must have a compact visual rail');
assert.match(renderer,/--scenario-share:\$\{share\}%/);
assert.match(renderer,/scenarioFamilyWeightCompact/,'compact scenario rows must label their percentage as weight');
assert.match(renderer,/independentFamilies[\s\S]*modelCountLabel\(s\.modelCount\)/,'family and model support must both remain visible');
assert.match(scenarios,/renderMetric\('temperature'/);
assert.match(scenarios,/precipitation-amount/);
assert.match(scenarios,/renderMetric\('gust'/);
assert.match(scenarios,/\['temp',[\s\S]*\['rain',[\s\S]*\['gust'/,'scenario facts must keep temperature, accumulation and gust as distinct metrics');
assert.match(section,/scenarioFamilyWeightNote/,'the section must explain that family weight is not weather probability');
assert.doesNotMatch(section,/buildScenarios\(/,'rendering must consume precomputed scenarios without changing their calculation');

assert.match(css,/\.scenario-facts\s*\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(css,/\.scenario-fact-temp \.wx-icon/);
assert.match(css,/\.scenario-fact-rain \.wx-icon/);
assert.match(css,/\.scenario-fact-gust \.wx-icon/);
assert.match(css,/\.scenario-timing-segment\.active i/);
assert.match(css,/\.scenario-method-note/);

const requiredKeys=['scenarioPrimary','scenarioFamilyWeight','scenarioFamilyWeightCompact','scenarioFamilyWeightNote','scenarioTimingAria','scenarioTimingEarly','scenarioTimingMiddle','scenarioTimingLate','scenarioTimingThroughout'];
for(const language of ['fr','en','es','de','it']){
  const {catalog}=await import(`../../../js/locales/${language}.js?scenario=${Date.now()}`);
  for(const key of requiredKeys)assert.ok(catalog[key],`${language}: missing ${key}`);
}

console.log('12 h scenario cards expose main scenario, timing, family weight and metric ranges: OK');
