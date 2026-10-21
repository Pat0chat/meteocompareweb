import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildTimelinePoints } from '../../../js/domain.js';
import { WEATHER_MODELS } from '../../../js/models.js';
const city={id:'feels-perf',latitude:48.8,longitude:2.3,timezone:'UTC'};
const start=new Date();start.setUTCMinutes(0,0,0);
const timestamps=Array.from({length:168},(_,i)=>new Date(start.getTime()+i*3_600_000).toISOString().slice(0,16));
const dates=[...new Set(timestamps.map(t=>t.slice(0,10)))];
const repeat=(length,value)=>Array.from({length},()=>value);
const seriesByModel=Object.fromEntries(WEATHER_MODELS.slice(0,16).map((model,modelIndex)=>{
  const temps=timestamps.map((_,i)=>12+modelIndex*.14+5*Math.sin(i/12));
  return [model.id,{
    hourly:{timestamps,temperature2m:temps,apparentTemperature:temps.map(v=>v-3),precipitation:repeat(168,0),precipitationProbability:repeat(168,10),cloudCover:repeat(168,40),windSpeed10m:repeat(168,12),windGusts10m:repeat(168,18),windDirection10m:repeat(168,100),weatherCode:repeat(168,2)},
    daily:{dates,tempMax:repeat(dates.length,21),tempMin:repeat(dates.length,12),apparentTempMax:repeat(dates.length,18),apparentTempMin:repeat(dates.length,9),precipitationSum:repeat(dates.length,0),precipitationProbabilityMax:repeat(dates.length,10),windSpeedMax:repeat(dates.length,16),windGustsMax:repeat(dates.length,21),windDirection10mDominant:repeat(dates.length,100),weatherCode:repeat(dates.length,2),sunrise:repeat(dates.length,null),sunset:repeat(dates.length,null)},
  }];
}));
const latest={city,seriesByModel},legacy=structuredClone(latest);
for(const series of Object.values(legacy.seriesByModel)){delete series.hourly.apparentTemperature;delete series.daily.apparentTempMax;delete series.daily.apparentTempMin;}
const options={hourlyHorizonHours:168,includeModelValues:true};
// Warm-up avoids conflating JIT initialization with the feature's steady-state cost.
for(let i=0;i<2;i++){buildTimelinePoints(latest,'HOURLY',start,options);buildTimelinePoints(legacy,'HOURLY',start,options);}
const timed=forecast=>{const begin=performance.now();const result=buildTimelinePoints(forecast,'HOURLY',start,options);return {ms:performance.now()-begin,result};};
const samples=[];
for(let i=0;i<3;i++){const old=timed(legacy),now=timed(latest);samples.push({old:old.ms,now:now.ms});assert.equal(old.result.length,168);assert.equal(now.result.length,168);assert.ok(now.result.some(row=>Number.isFinite(row.apparentTemperatureC)));}
const median=xs=>xs.slice().sort((a,b)=>a-b)[1];
const oldMs=median(samples.map(x=>x.old)),newMs=median(samples.map(x=>x.now));
assert.ok(newMs<400,`felt temperature exceeds 168h/16-model runtime budget: ${newMs.toFixed(1)}ms`);
assert.ok(newMs<Math.max(100,oldMs*3),`felt temperature excessive relative overhead (${oldMs.toFixed(1)}ms -> ${newMs.toFixed(1)}ms)`);
console.log(`Felt temperature performance (168h/16 models): baseline ${oldMs.toFixed(1)}ms, new ${newMs.toFixed(1)}ms; budget OK`);
