import assert from 'node:assert/strict';
import { currentConditions, aggregateDay, buildTimelinePoints, dailyCondition } from '../../../js/domain.js';

const day='2026-08-24',timestamp=`${day}T12:00`;
function series(code){return {
  hourly:{timestamps:[timestamp],temperature2m:[22],precipitation:[0],precipitationProbability:[10],cloudCover:[code===3?88:code===2?58:code===1?28:8],windSpeed10m:[8],windGusts10m:[14],weatherCode:[code]},
  daily:{dates:[day],tempMin:[15],tempMax:[25],precipitationSum:[0],precipitationProbabilityMax:[10],windSpeedMax:[10],windGustsMax:[16],windDirection10mDominant:[180],weatherCode:[code],sunrise:[null],sunset:[null]}
};}

const codes=[3,3,3,2,2,1,1,0,0];
const seriesByModel=Object.fromEntries(codes.map((code,index)=>[`MODEL_${index+1}`,series(code)]));
const forecast={city:{timezone:'UTC'},seriesByModel};

assert.equal(currentConditions(forecast,new Date(`${day}T12:05:00Z`)).condition,'PARTLY_CLOUDY','current Web condition must use ordinal sky-cover consensus');
assert.equal(aggregateDay(forecast,day).condition,'PARTLY_CLOUDY','daily Web synthesis must use ordinal sky-cover consensus');
const timeline=buildTimelinePoints(forecast,'HOURLY',new Date(`${day}T11:35:00Z`));
assert.equal(timeline[0]?.condition,'PARTLY_CLOUDY','timeline central condition must use the same sky-cover consensus');

const hourlyFallback={
  hourly:{timestamps:[`${day}T06:00`,`${day}T07:00`,`${day}T08:00`,`${day}T09:00`,`${day}T10:00`,`${day}T11:00`],weatherCode:[3,3,3,2,2,2],precipitation:[0,0,0,0,0,0],temperature2m:[20,20,20,20,20,20],cloudCover:[90,90,90,55,55,55]},
  daily:{dates:[day],weatherCode:[null]}
};
assert.equal(dailyCondition(hourlyFallback,day).condition,'PARTLY_CLOUDY','hourly fallback must not resolve a partly-cloudy/overcast tie toward overcast severity');

console.log('Web current/day/timeline condition consensus no longer fragments adjacent sky states: OK');
