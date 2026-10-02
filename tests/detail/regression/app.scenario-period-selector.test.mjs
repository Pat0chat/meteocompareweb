import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css'),state=read('js/core/app-state.js');

assert.match(app,/buildDailyScenarios/,'detail scenarios must consume the daily scenario domain calculation');
assert.match(app,/function cachedDailyScenarios\(f,maxDays=4/,'J+1 through J+4 must be prepared for the detail selector');
assert.match(app,/modes=\['12H','J1','J2','J3','J4'\]/,'the selector must expose exactly 12 h plus J+1 through J+4');
assert.match(app,/data-scenario-mode="\$\{candidate\}"/,'all scenario horizon buttons must be generated from the shared mode list');
assert.match(app,/J3:j3/);
assert.match(app,/J4:j4/);
assert.doesNotMatch(app,/data-scenario-mode="DAYS"/,'the former open-ended next-days selector must be removed');
assert.match(app,/dayForOffset=offset=>/,'daily horizons must share one exact-calendar resolver');
assert.match(app,/addDays\(baseDate,offset\)/,'J+1 through J+4 must target exact calendar days');
assert.match(app,/scenarioModeByCity/,'the selector must keep its mode per city without changing persisted forecast settings');
assert.match(state,/this\.scenarioModeByCity=\{\}/);
assert.match(app,/renderDailyScenarioDay/);
assert.match(app,/visible=variants\.slice\(0,SCENARIO_DISPLAY_LIMIT\)/,'J+1 through J+4 must keep up to the same three scenarios as the 12 h mode');
assert.match(app,/renderScenarioRows\(visible,\{limit:SCENARIO_DISPLAY_LIMIT,dayMode:true\}\)/,'future-day cards must reuse the full 12 h scenario presentation');
assert.match(app,/const SCENARIO_DISPLAY_LIMIT=3/,'all horizons must share the three-scenario display limit');
assert.match(app,/scenarioDayOtherVariants/,'variants beyond the first three must remain summarized');
assert.match(app,/scenarioTimingAriaDay/,'daily timing must not claim to describe the next 12 hours');
assert.match(app,/\['12H','J1','J2','J3','J4'\]\.includes\(target\.dataset\.scenarioMode\)/,'the click handler must accept J+3 and J+4');
assert.match(app,/rerenderCitySectionOrPage\('scenarios'\)/,'changing period should rerender only the scenario section when possible');

assert.match(css,/\.scenario-section-head \{ flex-direction:column;/,'the selector must sit below the title rather than beside it');
assert.match(css,/\.scenario-section-copy \{ min-width:0; width:100%; \}/);
assert.match(css,/\.scenario-mode-selector/);
assert.match(css,/\.scenario-day-selected/);
assert.match(css,/\.scenario-day-head/);

const keys=['scenarioModeAria','scenarioMode12h','scenarioModeJ1','scenarioModeJ2','scenarioModeJ3','scenarioModeJ4','scenarioDayOffsetTitle','scenarioDaySubtitle','scenarioTimingAriaDay','scenarioDayModels','scenarioDayOtherVariant','scenarioDayOtherVariants'];
for(const language of ['fr']){
  const {catalog}=await import(`../../../js/locales/${language}.js?scenarioPeriod=${Date.now()}`);
  for(const key of keys)assert.ok(catalog[key],`${language}: missing ${key}`);
  assert.equal(catalog.scenarioModeJ1,'J+1',`${language}: J+1 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ2,'J+2',`${language}: J+2 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ3,'J+3',`${language}: J+3 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ4,'J+4',`${language}: J+4 selector label must stay compact`);
  assert.equal(catalog.scenarioModeDays,undefined,`${language}: obsolete next-days label must be removed`);
}

for(const language of ['en']){
  const {catalog}=await import(`../../../js/locales/${language}.js?scenarioPeriod=${Date.now()}`);
  for(const key of keys)assert.ok(catalog[key],`${language}: missing ${key}`);
  assert.equal(catalog.scenarioModeJ1,'D+1',`${language}: D+1 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ2,'D+2',`${language}: D+2 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ3,'D+3',`${language}: D+3 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ4,'D+4',`${language}: D+4 selector label must stay compact`);
  assert.equal(catalog.scenarioModeDays,undefined,`${language}: obsolete next-days label must be removed`);
}

for(const language of ['es']){
  const {catalog}=await import(`../../../js/locales/${language}.js?scenarioPeriod=${Date.now()}`);
  for(const key of keys)assert.ok(catalog[key],`${language}: missing ${key}`);
  assert.equal(catalog.scenarioModeJ1,'D+1',`${language}: D+1 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ2,'D+2',`${language}: D+2 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ3,'D+3',`${language}: D+3 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ4,'D+4',`${language}: D+4 selector label must stay compact`);
  assert.equal(catalog.scenarioModeDays,undefined,`${language}: obsolete next-days label must be removed`);
}

for(const language of ['de']){
  const {catalog}=await import(`../../../js/locales/${language}.js?scenarioPeriod=${Date.now()}`);
  for(const key of keys)assert.ok(catalog[key],`${language}: missing ${key}`);
  assert.equal(catalog.scenarioModeJ1,'T+1',`${language}: T+1 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ2,'T+2',`${language}: T+2 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ3,'T+3',`${language}: T+3 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ4,'T+4',`${language}: T+4 selector label must stay compact`);
  assert.equal(catalog.scenarioModeDays,undefined,`${language}: obsolete next-days label must be removed`);
}

for(const language of ['it']){
  const {catalog}=await import(`../../../js/locales/${language}.js?scenarioPeriod=${Date.now()}`);
  for(const key of keys)assert.ok(catalog[key],`${language}: missing ${key}`);
  assert.equal(catalog.scenarioModeJ1,'G+1',`${language}: G+1 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ2,'G+2',`${language}: G+2 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ3,'G+3',`${language}: G+3 selector label must stay compact`);
  assert.equal(catalog.scenarioModeJ4,'G+4',`${language}: G+4 selector label must stay compact`);
  assert.equal(catalog.scenarioModeDays,undefined,`${language}: obsolete next-days label must be removed`);
}

console.log('detail scenario selector: 12 h / J+1 / J+2 / J+3 / J+4, three-card daily presentation and heading layout: OK');
