import assert from 'node:assert/strict';
import { buildScenarios, roundedHourLocal } from '../../../js/domain.js';

const anchor=roundedHourLocal('UTC'),anchorMs=Date.parse(`${anchor}Z`);
const timestamps=Array.from({length:12},(_,index)=>new Date(anchorMs+index*3600e3).toISOString().slice(0,16));

function series({baseTemp,amount=0,gust=25,wet=false}){
  const precipitation=Array(12).fill(0),weatherCode=Array(12).fill(wet?3:1);
  if(wet)for(const index of [4,5,6]){precipitation[index]=amount;weatherCode[index]=61;}
  return {hourly:{
    timestamps,
    temperature2m:Array.from({length:12},(_,index)=>baseTemp+index),
    precipitation,
    weatherCode,
    cloudCover:Array(12).fill(wet?85:20),
    windGusts10m:Array(12).fill(gust),
  }};
}

const forecast={city:{timezone:'UTC'},seriesByModel:{
  ECMWF:series({baseTemp:10,amount:.5,gust:35,wet:true}),
  ECMWF_AIFS:series({baseTemp:12,amount:1,gust:45,wet:true}),
  GFS:series({baseTemp:16,gust:25}),
}};

const scenarios=buildScenarios(forecast,Number.POSITIVE_INFINITY);
assert.equal(scenarios.length,2);
const [rain,clear]=scenarios;

assert.equal(rain.kind,'RAIN');
assert.equal(rain.timing,'MIDDLE');
assert.deepEqual(rain.modelIds.sort(),['ECMWF','ECMWF_AIFS']);
assert.equal(rain.modelCount,2);
assert.equal(rain.familyCount,1,'sibling ECMWF models must still represent one independent family');
assert.equal(rain.voteSharePercent,50,'two sibling models must not outweigh one independent GFS family');
assert.equal(rain.tempMin,10);
assert.equal(rain.tempMax,23);
assert.equal(rain.precipMin,1.5);
assert.equal(rain.precipMax,3);
assert.equal(rain.gustMin,35);
assert.equal(rain.gustMax,45);

assert.equal(clear.kind,'CLEAR');
assert.equal(clear.timing,'NONE');
assert.equal(clear.modelCount,1);
assert.equal(clear.familyCount,1);
assert.equal(clear.voteSharePercent,50);
assert.equal(clear.precipMin,0);
assert.equal(clear.precipMax,0);

assert.deepEqual(buildScenarios(forecast,1),[rain],'display limiting must select a scenario without recalculating or merging its ranges');
assert.ok(scenarios.every(s=>Number.isFinite(s.voteSharePercent)&&Array.isArray(s.modelIds)));
assert.ok(scenarios.every(s=>!Object.hasOwn(s,'probability')),'presentation percentages are family weights, never weather probabilities');

console.log('12 h scenario presentation contract (family weight, timing and metric ranges): OK');
