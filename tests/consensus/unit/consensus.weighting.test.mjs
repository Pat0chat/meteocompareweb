import assert from 'node:assert/strict';
import { familyBalancedWeights, weightedMedian, continuousConsensus, precipitationConsensus } from '../../../js/consensus.js';
import { aggregateDay, buildTimelinePoints, dayConfidence } from '../../../js/domain.js';
import { consensusGroupFor } from '../../../js/models.js';

// Sibling models must share one unit of influence.
assert.equal(consensusGroupFor('AROME_FRANCE_HD'),consensusGroupFor('AROME_FRANCE'));
assert.equal(consensusGroupFor('ICON_D2'),consensusGroupFor('ICON_GLOBAL'));
assert.notEqual(consensusGroupFor('GFS'),consensusGroupFor('HRRR_CONUS'));
const family=familyBalancedWeights(['ICON_D2','ICON_EU','ICON_GLOBAL','GFS']);
const iconMass=family.weights.ICON_D2+family.weights.ICON_EU+family.weights.ICON_GLOBAL;
assert.ok(Math.abs(iconMass-1)<1e-9,'ICON siblings must total one family vote');
assert.ok(Math.abs(family.weights.GFS-1)<1e-9,'an independent family keeps one vote');

// Weighted median is robust to an extreme outlier.
const robust=continuousConsensus([
  {modelId:'GFS',value:20},{modelId:'ECMWF',value:21},{modelId:'UKMO_GLOBAL',value:22},{modelId:'BOM_ACCESS',value:60}
],{},.5,3);
assert.equal(robust.central,21.5);
assert.ok(robust.convergencePercent<100,'the outlier must lower convergence even though it does not drag the center');

// Local reliability can move the central estimate, but only within bounded family masses.
const locallyWeighted=continuousConsensus([
  {modelId:'GFS',value:20},{modelId:'UKMO_GLOBAL',value:22},{modelId:'BOM_ACCESS',value:24}
],{GFS:.75,UKMO_GLOBAL:1.25,BOM_ACCESS:.75},.5,3);
assert.equal(locallyWeighted.central,22);

// Rain is split into P(wet) and amount conditional on wet; dry zeros do not dilute the wet amount.
const rain=precipitationConsensus([
  {modelId:'GFS',amount:0,probability:20},
  {modelId:'ECMWF',amount:8,probability:80},
  {modelId:'UKMO_GLOBAL',amount:10,probability:70},
  {modelId:'ICON_GLOBAL',amount:0,probability:30},
],{threshold:1});
assert.equal(rain.probabilityPercent,50);
assert.equal(rain.conditionalAmountMm,9);
assert.equal(rain.centralAmountMm,4.5);
assert.equal(rain.expectedAmountMm,4.5);

function series(tempMin,tempMax,precip,wind,prob=50){
  return {
    hourly:{timestamps:['2026-08-19T12:00'],temperature2m:[tempMax],precipitation:[precip/24],precipitationProbability:[prob],cloudCover:[40],windSpeed10m:[wind],windGusts10m:[wind+10],weatherCode:[2]},
    daily:{dates:['2026-08-19'],tempMin:[tempMin],tempMax:[tempMax],precipitationSum:[precip],precipitationProbabilityMax:[prob],windSpeedMax:[wind],windGustsMax:[wind+10],windDirection10mDominant:[180],weatherCode:[2],sunrise:['2026-08-19T06:30'],sunset:['2026-08-19T20:30'],completeness:{temperature:[{status:'FULL'}],precipitation:[{status:'FULL'}],wind:[{status:'FULL'}],condition:[{status:'FULL'}]}}
  };
}
const forecast={city:{timezone:'UTC'},seriesByModel:{
  GFS:series(15,25,0,20,20),
  ECMWF:series(16,26,8,22,80),
  UKMO_GLOBAL:series(17,27,10,24,70),
  BOM_ACCESS:series(18,55,0,80,30),
}};
const day=aggregateDay(forecast,'2026-08-19');
assert.equal(day.tempMax,26.5,'daily center must be a robust family-balanced median, not an arithmetic mean');
assert.equal(day.precipConditional,9);
assert.equal(day.precipProbability,50);
assert.equal(day.precip,4.5);
assert.ok(Number.isFinite(day.confidence.overallPercent));

const timeline=buildTimelinePoints(forecast,'DAILY',new Date('2026-08-19T10:00:00Z'));
assert.equal(timeline[0].tempMaxC,26.5);
assert.equal(timeline[0].precipitationConditionalMm,9);
assert.equal(timeline[0].precipitationPercent,50);

const convergence=dayConfidence(forecast,'2026-08-19');
assert.ok(Number.isFinite(convergence.convergencePercent));
assert.equal(convergence.convergencePercent,convergence.overallPercent);

console.log('Consensus weighting: OK');
