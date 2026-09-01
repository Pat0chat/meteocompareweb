import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeBatchedForecast } from '../../../js/data/forecast-normalizer.js';
import { forecastEngineContinuous, forecastEnginePrecipitation } from '../../../js/forecast-engines.js';
import { aggregateDay, buildTimelinePoints, currentConditions, dailyCondition, dailyPrecipitationTemperature, dayConfidence } from '../../../js/domain.js';
import { CONDITION, getModel } from '../../../js/models.js';

// Physical quality control must reject impossible source values before consensus.
const city={id:'qc',name:'QC',country:'FR',latitude:48,longitude:2,timezone:'UTC'};
const gfs=getModel('GFS');
const raw={
  latitude:48,longitude:2,timezone:'UTC',
  hourly:{
    time:['2026-09-01T10:00','2026-09-01T11:00'],
    temperature_2m_ncep_gfs_seamless:[20,999], precipitation_ncep_gfs_seamless:[0,999], precipitation_probability_ncep_gfs_seamless:[10,140],
    cloud_cover_ncep_gfs_seamless:[20,180], wind_speed_10m_ncep_gfs_seamless:[10,500], wind_gusts_10m_ncep_gfs_seamless:[20,800],
    wind_direction_10m_ncep_gfs_seamless:[180,999], weather_code_ncep_gfs_seamless:[1,999],
  },
  daily:{
    time:['2026-09-01'], temperature_2m_max_ncep_gfs_seamless:[-10], temperature_2m_min_ncep_gfs_seamless:[20],
    precipitation_sum_ncep_gfs_seamless:[2000], precipitation_probability_max_ncep_gfs_seamless:[120], wind_speed_10m_max_ncep_gfs_seamless:[500],
    wind_gusts_10m_max_ncep_gfs_seamless:[600], wind_direction_10m_dominant_ncep_gfs_seamless:[999], weather_code_ncep_gfs_seamless:[999],
    sunrise:['2026-09-01T06:00'],sunset:['2026-09-01T20:00'],
  },
};
const normalized=normalizeBatchedForecast(raw,city,[gfs],24);
const q=normalized.seriesByModel.GFS;
assert.deepEqual(q.hourly.temperature2m,[20,null]);
assert.deepEqual(q.hourly.precipitation,[0,null]);
assert.deepEqual(q.hourly.precipitationProbability,[10,null]);
assert.equal(q.daily.tempMax[0],null,'Tmax<Tmin must reject the inconsistent pair');
assert.equal(q.daily.tempMin[0],null,'Tmax<Tmin must reject the inconsistent pair');
assert.ok(normalized.modelMeta.GFS.qualityControl.rejectedValues>=6);
assert.equal(normalized.modelMeta.GFS.qualityControl.temperaturePairRejects,1);

// A corrupt legacy/cache value must be rejected at engine level too; 1–2 families remain usable but explicitly limited.
const single=forecastEngineContinuous([{modelId:'GFS',value:20},{modelId:'ECMWF',value:999}],{qualityMin:-100,qualityMax:65,tight:.5,wide:3});
assert.equal(single.central,20);
assert.equal(single.count,1);
assert.equal(single.convergencePercent,null);
assert.equal(single.evidenceLevel,'SINGLE_SOURCE');
const limited=forecastEngineContinuous([{modelId:'GFS',value:20},{modelId:'ECMWF',value:21}],{qualityMin:-100,qualityMax:65,tight:.5,wide:3});
assert.equal(limited.familyCount,2);
assert.equal(limited.evidenceLevel,'LIMITED');
assert.ok(Number.isFinite(limited.convergencePercent));

// Missing current hour must not be silently bridged with a neighbouring model hour.
function gapSeries(){return {
  hourly:{timestamps:['2026-09-01T10:00','2026-09-01T12:00'],temperature2m:[18,22],precipitation:[0,0],precipitationProbability:[0,0],cloudCover:[20,20],windSpeed10m:[8,8],windGusts10m:[12,12],windDirection10m:[180,180],weatherCode:[1,1]},
  daily:{dates:['2026-09-01'],tempMax:[22],tempMin:[12],precipitationSum:[0],precipitationProbabilityMax:[0],windSpeedMax:[8],windGustsMax:[12],windDirection10mDominant:[180],weatherCode:[1],sunrise:['2026-09-01T06:00'],sunset:['2026-09-01T20:00']},
};}
const gapForecast={city:{timezone:'UTC'},seriesByModel:{GFS:gapSeries()}};
const missingNow=currentConditions(gapForecast,new Date('2026-09-01T11:10:00Z'));
assert.equal(missingNow.modelCount,0);
assert.equal(missingNow.temperature,null);

// Daily rain/snow fallback must use temperature during precipitation, not daily Tmin.
const wetSeries={
  hourly:{timestamps:['2026-09-01T06:00','2026-09-01T15:00'],temperature2m:[-5,5],precipitation:[0,6],precipitationProbability:[0,100],cloudCover:[90,90],windSpeed10m:[5,5],windGusts10m:[8,8],windDirection10m:[180,180],weatherCode:[null,null]},
  daily:{dates:['2026-09-01'],tempMax:[8],tempMin:[-5],precipitationSum:[6],precipitationProbabilityMax:[100],windSpeedMax:[5],windGustsMax:[8],windDirection10mDominant:[180],weatherCode:[null],sunrise:['2026-09-01T06:00'],sunset:['2026-09-01T20:00']},
};
assert.equal(dailyPrecipitationTemperature(wetSeries,'2026-09-01'),5);
assert.equal(dailyCondition(wetSeries,'2026-09-01').condition,CONDITION.RAIN);

// Daily convergence has one contract everywhere: summary and daily timeline must match exactly.
const mkSeries=(max,min,rain,prob,wind,code=2)=>({
  hourly:{timestamps:['2026-09-01T12:00'],temperature2m:[(max+min)/2],precipitation:[rain],precipitationProbability:[prob],cloudCover:[50],windSpeed10m:[wind],windGusts10m:[wind+5],windDirection10m:[180],weatherCode:[code]},
  daily:{dates:['2026-09-01'],tempMax:[max],tempMin:[min],precipitationSum:[rain],precipitationProbabilityMax:[prob],windSpeedMax:[wind],windGustsMax:[wind+5],windDirection10mDominant:[180],weatherCode:[code],sunrise:['2026-09-01T06:00'],sunset:['2026-09-01T20:00']},
});
const dailyForecast={city:{timezone:'UTC'},seriesByModel:{GFS:mkSeries(25,15,2,70,15),ECMWF:mkSeries(26,16,3,75,17),UKMO_GLOBAL:mkSeries(24,14,1,65,14)}};
const dailyScore=dayConfidence(dailyForecast,'2026-09-01');
const dailyPoint=buildTimelinePoints(dailyForecast,'DAILY',new Date('2026-09-01T00:00:00Z'))[0];
assert.equal(dailyPoint.consensusPercent,dailyScore.overallPercent);
assert.deepEqual(dailyPoint.divergenceReasons,dailyScore.divergenceReasons);

// Adaptive calibration must propagate residual historical uncertainty instead of only source spread.
const calibration={};
for(const modelId of ['GFS','ECMWF','UKMO_GLOBAL']) calibration[modelId]={bias:0,score:80,standardDeviation:4,meanAbsoluteError:3,sampleSize:30};
const adaptive=forecastEngineContinuous([{modelId:'GFS',value:20},{modelId:'ECMWF',value:21},{modelId:'UKMO_GLOBAL',value:22}],{engine:'ADAPTIVE',calibration,tight:.5,wide:3});
assert.equal(adaptive.effectiveEngine,'CALIBRATION');
assert.ok(adaptive.uncertainty.calibrationResidualSigma>0);
assert.ok(adaptive.uncertainty.totalSigma>adaptive.uncertainty.interModelSigma);
assert.ok((adaptive.interval.high-adaptive.interval.low)>(adaptive.allSourceInterval.high-adaptive.allSourceInterval.low));

// Scenario engine must distinguish the dominant-scenario interval from the spread of all sources.
const scenario=forecastEngineContinuous([
  {modelId:'GFS',value:0},{modelId:'ECMWF',value:.1},{modelId:'UKMO_GLOBAL',value:.2},{modelId:'BOM_ACCESS',value:10},{modelId:'ARPEGE_EUROPE',value:10.2},
],{engine:'SCENARIOS',tight:.5,wide:3});
assert.equal(scenario.effectiveEngine,'SCENARIOS');
assert.ok(scenario.scenarioInterval&&scenario.allSourceInterval);
assert.ok((scenario.allSourceInterval.high-scenario.allSourceInterval.low)>(scenario.scenarioInterval.high-scenario.scenarioInterval.low));

// Rain amount must be continuous around 50%, and its uncertainty/ranges must use the same expected-amount scale.
const rainRows=p=>['GFS','ECMWF','UKMO_GLOBAL'].map(modelId=>({modelId,amount:10,probability:p}));
const rain49=forecastEnginePrecipitation(rainRows(49),{engine:'MULTI_CONSENSUS'});
const rain50=forecastEnginePrecipitation(rainRows(50),{engine:'MULTI_CONSENSUS'});
assert.ok(Math.abs(rain49.centralAmountMm-4.9)<1e-9);
assert.ok(Math.abs(rain50.centralAmountMm-5)<1e-9);
assert.ok(Math.abs(rain50.centralAmountMm-rain49.centralAmountMm)<.11,'crossing 50% must not create a discontinuous rain jump');
assert.ok(rain50.interval.low<=rain50.centralAmountMm&&rain50.interval.high>=rain50.centralAmountMm);
const rainDispersed=forecastEnginePrecipitation([
  {modelId:'GFS',amount:10,probability:100},{modelId:'ECMWF',amount:10,probability:60},{modelId:'UKMO_GLOBAL',amount:10,probability:80},
],{engine:'MULTI_CONSENSUS'});
assert.ok(rainDispersed.uncertainty.probabilitySigma>0);
assert.ok(rainDispersed.uncertainty.totalSigma>0);

// Full calibration object participates in cache invalidation, including future fields.
const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
assert.match(app,/canonicalSignatureValue\(o\.calibrationByVariable\|\|\{\}\)/);
assert.doesNotMatch(app,/calibrationSignatureProfile/);

// Aggregate rain source range must be on expected-amount scale as well.
const agg=aggregateDay(dailyForecast,'2026-09-01');
assert.ok(agg.data.every(row=>row.precipExpectedSource==null||Number.isFinite(row.precipExpectedSource)));
assert.ok(agg.precipRange[0]<=agg.precip&&agg.precip<=agg.precipRange[1]);

console.log('Forecast engine safety, uncertainty and pedagogical diagnostics: OK');
