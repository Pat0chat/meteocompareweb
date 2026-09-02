import assert from 'node:assert/strict';
import { aggregateDay, buildScenarios, roundedHourLocal } from '../../../js/domain.js';
import { FORECAST_ENGINES } from '../../../js/forecast-engines.js';

const anchor=roundedHourLocal('UTC'),anchorMs=Date.parse(`${anchor}Z`),date=anchor.slice(0,10);
const timestamps=Array.from({length:24},(_,index)=>new Date(anchorMs+index*3600e3).toISOString().slice(0,16));

function series(modelIndex,{wet=false,late=false}={}){
  const precipitation=Array(24).fill(0),weatherCode=Array(24).fill(2);
  if(wet)for(const index of late?[8,9,10]:[2,3,4]){precipitation[index]=.4+modelIndex*.2;weatherCode[index]=61;}
  const temp=18+modelIndex,wind=17+modelIndex*2,gust=29+modelIndex*3,probability=wet?75:15;
  return {
    hourly:{
      timestamps,
      temperature2m:Array.from({length:24},(_,index)=>temp+index*.2),
      precipitation,
      precipitationProbability:Array(24).fill(probability),
      cloudCover:Array(24).fill(wet?82:35),
      windSpeed10m:Array(24).fill(wind),
      windGusts10m:Array(24).fill(gust),
      windDirection10m:Array(24).fill(190),
      weatherCode,
    },
    daily:{
      dates:[date],tempMin:[temp-4],tempMax:[temp+6],precipitationSum:[precipitation.slice(0,12).reduce((sum,value)=>sum+value,0)],
      precipitationProbabilityMax:[probability],windSpeedMax:[wind],windGustsMax:[gust],windDirection10mDominant:[190],weatherCode:[wet?61:2],
      sunrise:[`${date}T06:30`],sunset:[`${date}T20:30`],
    },
  };
}

const forecast={city:{timezone:'UTC'},seriesByModel:{
  ARPEGE_EUROPE:series(0,{wet:true}),
  ICON_EU:series(1,{wet:true}),
  GFS:series(2),
  ECMWF:series(3,{wet:true,late:true}),
  ECMWF_AIFS:series(4,{wet:true,late:true}),
}};
const baseline=buildScenarios(forecast,Number.POSITIVE_INFINITY),forecastSnapshot=structuredClone(forecast);

assert.ok(baseline.length>=3,'fixture must expose several coherent 12 h scenarios');
for(const forecastEngine of FORECAST_ENGINES){
  const aggregate=aggregateDay(forecast,date,{forecastEngine});
  assert.equal(aggregate.forecastEngine,forecastEngine,`${forecastEngine}: daily engine selection should remain observable`);
  assert.deepEqual(buildScenarios(forecast,Number.POSITIVE_INFINITY),baseline,`${forecastEngine}: daily engine execution must not alter 12 h scenario grouping, ranking or ranges`);
}

assert.deepEqual(forecast,forecastSnapshot,'running every forecast engine must preserve source data beyond the reusable hourly-axis cache');
assert.ok(baseline.every(s=>!Object.hasOwn(s,'forecastEngine')&&!Object.hasOwn(s,'engineDetails')),'12 h scenarios must remain a stable engine-independent calculation contract');

console.log('12 h scenarios remain isolated from all selectable daily forecast engines: OK');
