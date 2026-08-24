import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { forecastEngineContinuous, forecastEnginePrecipitation, FORECAST_ENGINES } from '../../../js/forecast-engines.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../../js/data/contracts.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=path=>fs.readFileSync(resolve(root,path),'utf8');
const entries=values=>values.map(([modelId,value])=>({modelId,value}));

assert.deepEqual(FORECAST_ENGINES,['MULTI_CONSENSUS','CALIBRATION','SCENARIOS','ADAPTIVE']);
assert.equal(DEFAULT_SETTINGS.forecastEngine,'MULTI_CONSENSUS');
assert.equal(normalizeSettings({forecastEngine:'SCENARIOS'}).forecastEngine,'SCENARIOS');
assert.equal(normalizeSettings({forecastEngine:'UNKNOWN'}).forecastEngine,'MULTI_CONSENSUS');

const outlier=entries([
  ['ARPEGE_EUROPE',18],['ICON_EU',18.5],['GFS',19],['ECMWF',19.2],['UKMO_GLOBAL',27],
]);
const robust=forecastEngineContinuous(outlier,{engine:'MULTI_CONSENSUS',tight:.5,wide:3});
assert.ok(robust.central>18&&robust.central<20,'multi-consensus should resist an isolated high outlier');
assert.equal(robust.effectiveEngine,'MULTI_CONSENSUS');
assert.ok(robust.rows.find(row=>row.modelId==='UKMO_GLOBAL').robustFactor<.3,'isolated outlier should be downweighted progressively');

const insufficientCalibration={
  ARPEGE_EUROPE:{bias:1,score:80,standardDeviation:.7,meanAbsoluteError:.5,sampleSize:20},
};
const calibrationFallback=forecastEngineContinuous(outlier,{engine:'CALIBRATION',calibration:insufficientCalibration,tight:.5,wide:3});
assert.equal(calibrationFallback.engine,'CALIBRATION');
assert.equal(calibrationFallback.fallback,true);
assert.equal(calibrationFallback.effectiveEngine,'MULTI_CONSENSUS');

const fullCalibration=Object.fromEntries(outlier.map(row=>[row.modelId,{bias:row.modelId==='UKMO_GLOBAL'?8:1,score:80,standardDeviation:.8,meanAbsoluteError:.6,sampleSize:20}]));
const calibrated=forecastEngineContinuous(outlier,{engine:'CALIBRATION',calibration:fullCalibration,tight:.5,wide:3});
assert.equal(calibrated.fallback,false);
assert.equal(calibrated.effectiveEngine,'CALIBRATION');
assert.equal(calibrated.calibrationCoverage,1);
assert.ok(calibrated.central<robust.central-0.5,'calibration should correct systematic positive bias before aggregation');

const bimodal=entries([
  ['ARPEGE_EUROPE',17],['ICON_EU',17.4],['GFS',17.8],['ECMWF',18],['UKMO_GLOBAL',23],['GEM_GLOBAL',23.5],
]);
const scenario=forecastEngineContinuous(bimodal,{engine:'SCENARIOS',tight:.5,wide:3});
assert.equal(scenario.scenarioCount,2,'scenario engine should preserve a coherent minority cluster');
assert.ok(scenario.dominantShare>.6&&scenario.dominantShare<.7);
assert.ok(scenario.central<19,'scenario engine should use the dominant cluster instead of averaging incompatible clusters');
const adaptive=forecastEngineContinuous(bimodal,{engine:'ADAPTIVE',tight:.5,wide:3});
assert.equal(adaptive.effectiveEngine,'SCENARIOS','adaptive engine should select scenario mode for a strong multimodal split');
assert.equal(adaptive.scenarioCount,2);

const precipRows=[
  {modelId:'ARPEGE_EUROPE',amount:4,probability:70},
  {modelId:'ICON_EU',amount:5,probability:75},
  {modelId:'GFS',amount:6,probability:80},
  {modelId:'ECMWF',amount:5.5,probability:78},
];
const precipCalibration=Object.fromEntries(precipRows.map(row=>[row.modelId,{bias:1,score:80,standardDeviation:1,meanAbsoluteError:.8,sampleSize:20,precipitation:{observedWetDays:14,forecastWetDays:14}}]));
const rawRain=forecastEnginePrecipitation(precipRows,{engine:'MULTI_CONSENSUS'});
const calibratedRain=forecastEnginePrecipitation(precipRows,{engine:'CALIBRATION',calibration:precipCalibration});
assert.ok(calibratedRain.conditionalAmountMm<rawRain.conditionalAmountMm,'rain calibration should correct amount bias');
assert.ok(calibratedRain.conditionalAmountMm>rawRain.conditionalAmountMm-1.5,'rain bias must not be applied twice');
assert.ok(calibratedRain.probabilityPercent>=0&&calibratedRain.probabilityPercent<=100);

const app=read('js/app.js'),css=read('styles.css'),sw=read('sw.js');
assert.match(app,/data-forecast-engine="\$\{engine\}"/,'settings must expose all forecast engines');
assert.match(app,/data-action="open-engine-comparison"/,'city details must expose engine comparison');
assert.match(app,/type:'forecastEngines'/,'engine comparison must use a dedicated modal');
assert.match(app,/cachedAggregateDay\(f,today,engineContext\)/,'detail summary must use selected engine context');
assert.match(app,/renderTimeline\(f,engineContext\)/,'detail timeline must use selected engine context');
assert.match(app,/renderConfidenceSection\(f,cityId,engineContext\)/,'detail forecast band must use selected engine context');
assert.match(css,/\.forecast-engine-choice-grid/);
assert.match(css,/\.forecast-engine-result\.selected-engine/,'selected engine must be visually highlighted in comparison');
assert.match(sw,/\.\/js\/forecast-engines\.js/,'forecast engine runtime must be available offline');
for(const locale of ['fr','en','es','de','it']){
  const text=read(`js/locales/${locale}.js`);
  for(const key of ['forecastEngineTitle','forecastEngineMulti','forecastEngineCalibration','forecastEngineScenarios','forecastEngineAdaptive','forecastEngineCompare','forecastEngineModalTitle']) assert.ok(text.includes(`"${key}"`),`${locale} missing ${key}`);
}

console.log('MeteoCompare Forecast Engines: OK');
