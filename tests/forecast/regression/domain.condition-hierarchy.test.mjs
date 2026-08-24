import assert from 'node:assert/strict';
import { currentConditions, aggregateDay, buildTimelinePoints, dailyCondition } from '../../../js/domain.js';

const day='2026-08-24',timestamp=`${day}T12:00`;
const settings={
  0:{precip:0,prob:5,cloud:8},
  51:{precip:.2,prob:70,cloud:88},
  61:{precip:1.8,prob:80,cloud:92},
  80:{precip:1.1,prob:75,cloud:86},
};
function series(code){const row=settings[code]||settings[0];return {
  hourly:{timestamps:[timestamp],temperature2m:[18],precipitation:[row.precip],precipitationProbability:[row.prob],cloudCover:[row.cloud],windSpeed10m:[8],windGusts10m:[14],weatherCode:[code]},
  daily:{dates:[day],tempMin:[12],tempMax:[20],precipitationSum:[row.precip],precipitationProbabilityMax:[row.prob],windSpeedMax:[10],windGustsMax:[16],windDirection10mDominant:[180],weatherCode:[code],sunrise:[null],sunset:[null]}
};}

const codes=[0,0,0,51,51,61,61,80,80];
const forecast={city:{timezone:'UTC'},seriesByModel:Object.fromEntries(codes.map((code,index)=>[`MODEL_${index+1}`,series(code)]))};

assert.equal(currentConditions(forecast,new Date(`${day}T12:05:00Z`)).condition,'RAIN','current condition must aggregate drizzle/rain/showers before competing with dry conditions');
assert.equal(aggregateDay(forecast,day).condition,'RAIN','daily synthesis must use the same hierarchical precipitation consensus');
const timeline=buildTimelinePoints(forecast,'HOURLY',new Date(`${day}T11:35:00Z`));
assert.equal(timeline[0]?.condition,'RAIN','timeline condition must not let fragmented liquid precipitation lose to a dry plurality');

const hourlyFallback={
  hourly:{timestamps:[`${day}T06:00`,`${day}T07:00`,`${day}T08:00`,`${day}T09:00`,`${day}T10:00`,`${day}T11:00`,`${day}T12:00`,`${day}T13:00`,`${day}T14:00`],weatherCode:[0,0,0,51,51,61,61,80,80],precipitation:[0,0,0,.1,.1,.8,.8,.6,.6],temperature2m:[18,18,18,18,18,18,18,18,18],cloudCover:[10,10,10,85,85,90,90,86,86]},
  daily:{dates:[day],weatherCode:[null]}
};
assert.equal(dailyCondition(hourlyFallback,day).condition,'RAIN','hourly fallback must aggregate precipitation subtypes hierarchically as well');

console.log('Web current/day/timeline/fallback all use hierarchical condition consensus: OK');
