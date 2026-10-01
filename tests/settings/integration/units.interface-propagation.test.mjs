import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const app=read('js/app.js'),api=read('js/api.js'),comparison=read('js/features/comparison.js'),radar=read('js/features/radar.js'),sw=read('sw.js'),contracts=read('js/data/contracts.js');

// Canonical API data must stay metric so thresholds, consensus, bias and history are invariant.
assert.match(api,/wind_speed_unit','kmh'/);
assert.match(api,/temperature_unit','celsius'/);
assert.match(api,/precipitation_unit','mm'/);
assert.match(contracts,/unitSystem:\s*DEFAULT_UNIT_SYSTEM/);
assert.match(contracts,/unitSystem:\s*normalizeUnitSystem\(source\.unitSystem\)/);

// Settings / UI wiring.
assert.match(app,/data-unit-system="\$\{id\}"/);
assert.match(app,/state\.settings\.unitSystem=target\.dataset\.unitSystem/);
assert.match(app,/function activeUnitSystem\(\)\{return state\.settings\.unitSystem\|\|'METRIC';\}/);
assert.match(app,/function measurement\(kind,value/);
assert.match(app,/function measurementRange\(kind,low,high/);
assert.match(app,/kind==='precipitation'&&Math\.abs\(converted\)>0&&Math\.abs\(converted\)<\.01\?3/,'small imperial precipitation values must not round to 0.00 in');
assert.match(app,/kind==='precipitation'&&\[a,b\]\.some\(value=>Math\.abs\(value\)>0&&Math\.abs\(value\)<\.01\)\?3/,'small imperial precipitation ranges must retain a visible third decimal');
assert.match(app,/function chartDisplayDelta\(metric,value\)/);

// Primary and secondary surfaces must use the shared formatters.
assert.match(app,/compactTemperature\(now\.temperature,1\)/,'home current temperature must expose the selected unit');
assert.match(app,/measurement\('wind',day\.gust,\{compact:true\}\)/,'home gust must follow the selected unit');
assert.match(app,/measurement\('precipitation',precipAmount\)/,'home precipitation must follow the selected unit');
assert.match(app,/measurement\('wind',gust,\{compact:true\}\)/,'chronology gust must not leak canonical km\/h values');
assert.match(app,/gustAbbr'\)\)} \$\{measurement\('wind',g,\{compact:true\}\)\}/,'model table gusts must carry their unit');
assert.match(app,/measurement\('length',e\.value,\{digits:2\}\)/,'tide rows must keep 2-decimal level precision');
assert.match(app,/lengthValue=.*measurement\('length',a\[idx\],\{digits:1\}\)/,'wave/swell KPIs must keep historical 1-decimal precision');
assert.match(app,/modelResolutionLabel\(m\.resolutionKm\)/,'model resolution must be localized to km/mi');
assert.match(app,/unitValue\('temperatureDelta'/,'temperature differences must use delta conversion');
assert.match(app,/chartDisplayDelta\(metric,metric==='TEMPERATURE'\?2:1\)/,'converted chart scales must use converted spans');
assert.match(app,/minimumSpan=kind==='temperature'\?unitValue\('temperatureDelta',\.5\):kind\?unitValue\(kind,\.5\):\.5/,'forecast-engine charts must convert their minimum visual span');
assert.match(app,/minSpan:unitValue\('temperatureDelta',\.8\)/,'evolution temperature tracks must convert their canonical minimum span');
assert.match(app,/minSpan:unitValue\('precipitation',\.8\)/,'evolution precipitation tracks must convert their canonical minimum span');
assert.match(app,/minSpan:unitValue\('wind',\.8\)/,'evolution wind tracks must convert their canonical minimum span');
assert.match(app,/renderEvolutionTrajectory\(e,m\.unit,m\.threshold,m\.min,m\.minSpan\)/,'evolution tracks must receive the converted span');
assert.match(app,/minSpan:variable==='TEMPERATURE'\?unitValue\('temperatureDelta',1\)/,'bias trend charts must convert temperature span as a delta');
assert.match(app,/minSpan:variable==='TEMPERATURE'\?unitValue\('temperatureDelta',2\)/,'bias history charts must convert temperature span as a delta');
assert.match(comparison,/minSpan:convertChartMetricDelta\(metric,metric==='TEMPERATURE'\?2:1,unitSystem\)/,'comparison charts must convert their visual span');

// Lazy features must remain unit-safe even if used without app-level formatter callbacks.
assert.match(comparison,/convertChartMetricDelta/);
assert.match(comparison,/chartMetricUnitFor\(m,unitSystem\)/);
assert.match(comparison,/convertDistance\(km,ctx\.unitSystem\|\|'METRIC'\)/);
assert.doesNotMatch(comparison,/\?'°C'.*'mm'.*'km\/h'/s,'comparison fallback must not hard-code metric units');
assert.match(radar,/fallbackMeasurement\('precipitation'/);
assert.match(radar,/fallbackMeasurement\('wind'/);
assert.doesNotMatch(radar,/toLocaleString\(locale,[^\n]*\} mm/,'radar fallback must not hard-code mm');
assert.doesNotMatch(radar,/Math\.round\(value\)\} km\/h/,'radar fallback must not hard-code km/h');
assert.match(app,/unitSystem:activeUnitSystem\(\),formatPrecipitation/,'radar receives the active unit system explicitly');

// PWA offline shell must contain the conversion module.
assert.match(sw,/['"]\.\/js\/units\.js['"]/);

// All five shipped languages expose the unit setting labels.
for(const lang of ['fr','en','es','de','it']){
  const locale=read(`js/locales/${lang}.js`);
  for(const key of ['units','unitsIntro','metricUnits','imperialUnits','metricUnitsHint','imperialUnitsHint','unitsChangedToast'])assert.match(locale,new RegExp(`["']${key}["']\\s*:`),`${lang} missing ${key}`);
}

console.log('unit interface propagation: OK');
