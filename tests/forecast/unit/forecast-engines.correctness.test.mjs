import assert from 'node:assert/strict';
import { precipitationConsensus } from '../../../js/consensus.js';
import { forecastEngineContinuous, forecastEnginePrecipitation } from '../../../js/forecast-engines.js';

const ids=['ARPEGE_EUROPE','GFS','ECMWF'];
const probabilityRows=values=>ids.map((modelId,index)=>({modelId,amount:null,probability:values[index]}));

const all50=precipitationConsensus(probabilityRows([50,50,50]));
const all80=precipitationConsensus(probabilityRows([80,80,80]));
const dispersed80=precipitationConsensus(probabilityRows([100,60,80]));
assert.equal(all50.occurrenceConvergencePercent,100,'agreement must be perfect when all models say 50%, even though event certainty is low');
assert.equal(all50.convergencePercent,100);
assert.equal(all80.occurrenceConvergencePercent,100);
assert.ok(dispersed80.occurrenceConvergencePercent<all80.occurrenceConvergencePercent,'equal mean PoP must not hide disagreement between models');
assert.ok(dispersed80.occurrenceConvergencePercent>=0&&dispersed80.occurrenceConvergencePercent<=100);

const split=forecastEngineContinuous([
  {modelId:'ARPEGE_EUROPE',value:0},
  {modelId:'GFS',value:0},
  {modelId:'ECMWF',value:10},
  {modelId:'UKMO_GLOBAL',value:10},
],{engine:'SCENARIOS',tight:.5,wide:3});
assert.equal(split.scenarioCount,2);
assert.equal(split.fallback,true,'a 50/50 bimodal split has no dominant scenario');
assert.equal(split.fallbackReason,'NO_DOMINANT_SCENARIO');
assert.equal(split.effectiveEngine,'MULTI_CONSENSUS');
assert.equal(split.central,5,'ambiguous scenarios must preserve the robust central consensus instead of choosing the low cluster by array order');

const entries=ids.map(modelId=>({modelId,value:20}));
const zeroScoreCalibration=Object.fromEntries(ids.map(modelId=>[modelId,{bias:2,score:0,standardDeviation:0,meanAbsoluteError:10,sampleSize:30}]));
const zeroScore=forecastEngineContinuous(entries,{engine:'CALIBRATION',calibration:zeroScoreCalibration,tight:.5,wide:3});
assert.equal(zeroScore.historicalScore,0,'a valid historical score of zero must not be replaced by the default score 50');
assert.ok(Math.abs(zeroScore.interval.high-zeroScore.interval.low)<1e-6,'a valid residual standard deviation of zero must not fall back to MAE');

const horizonCalibration=Object.fromEntries(ids.map(modelId=>[modelId,{
  bias:2,score:80,standardDeviation:1,meanAbsoluteError:.8,sampleSize:30,
  byLeadDay:{
    1:{bias:2,score:80,standardDeviation:1,meanAbsoluteError:.8,sampleSize:30},
    2:{bias:-3,score:80,standardDeviation:1,meanAbsoluteError:.8,sampleSize:30},
  },
}]));
const d1=forecastEngineContinuous(entries,{engine:'CALIBRATION',calibration:horizonCalibration,leadDay:1,tight:.5,wide:3});
const d2=forecastEngineContinuous(entries,{engine:'CALIBRATION',calibration:horizonCalibration,leadDay:2,tight:.5,wide:3});
const d3=forecastEngineContinuous(entries,{engine:'CALIBRATION',calibration:horizonCalibration,leadDay:3,tight:.5,wide:3});
assert.equal(d1.central,18);
assert.equal(d2.central,23);
assert.equal(d3.fallback,true,'D+1 calibration must never leak into an unavailable D+3 profile');
assert.equal(d3.central,20);

const rainRows=ids.map((modelId,index)=>({modelId,amount:.2+index*.01,probability:100}));
const genericRainBias=Object.fromEntries(ids.map(modelId=>[modelId,{bias:5,score:80,standardDeviation:1,meanAbsoluteError:1,sampleSize:30,precipitation:{observedWetDays:20,forecastWetDays:20}}]));
const rawRain=forecastEnginePrecipitation(rainRows,{engine:'MULTI_CONSENSUS'});
const genericOnly=forecastEnginePrecipitation(rainRows,{engine:'CALIBRATION',calibration:genericRainBias});
assert.ok(Math.abs(genericOnly.conditionalAmountMm-rawRain.conditionalAmountMm)<1e-9,'unconditional daily rain bias must not be applied to wet-event amount');

const conditionalRainBias=Object.fromEntries(ids.map(modelId=>[modelId,{bias:5,score:80,standardDeviation:1,meanAbsoluteError:1,sampleSize:30,precipitation:{observedWetDays:30,forecastWetDays:30,conditionalAmount:{bias:5,score:80,standardDeviation:0,meanAbsoluteError:5,sampleSize:30}}}]));
const coherent=forecastEnginePrecipitation(rainRows,{engine:'CALIBRATION',calibration:conditionalRainBias});
assert.equal(coherent.probabilityPercent,100);
assert.ok(coherent.conditionalAmountMm>.1,'a wet-event amount must stay strictly above the rain occurrence threshold after calibration');
assert.ok(coherent.centralAmountMm>.1,'100% rain probability must not produce a 0 mm central amount');
assert.ok(coherent.expectedAmountMm>.1);

console.log('Forecast engine statistical correctness regressions: OK');
