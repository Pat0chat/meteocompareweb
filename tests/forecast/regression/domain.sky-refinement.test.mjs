import assert from 'node:assert/strict';
import { CONDITION } from '../../../js/models.js';
import { currentConditions, aggregateDay, buildTimelinePoints } from '../../../js/domain.js';

const day='2026-09-02',timestamp=`${day}T12:00`;
function series(cloud){return {
  hourly:{timestamps:[timestamp],temperature2m:[20],precipitation:[0],precipitationProbability:[5],cloudCover:[cloud],windSpeed10m:[8],windGusts10m:[14],weatherCode:[3]},
  daily:{dates:[day],tempMin:[14],tempMax:[24],precipitationSum:[0],precipitationProbabilityMax:[5],windSpeedMax:[10],windGustsMax:[16],windDirection10mDominant:[180],weatherCode:[3],sunrise:[null],sunset:[null]},
};}
const forecast={city:{timezone:'UTC'},seriesByModel:{GFS:series(40),ECMWF:series(55),UKMO_GLOBAL:series(60)}};

const current=currentConditions(forecast,new Date(`${day}T12:05:00Z`));
assert.equal(current.condition,CONDITION.PARTLY_CLOUDY,'robust cloud cover must refine an all-overcast WMO sky vote');
assert.equal(current.conditionSource,'CONSENSUS_VARIABLES');
assert.equal(current.conditionInferred,true);

const daily=aggregateDay(forecast,day);
assert.equal(daily.condition,CONDITION.PARTLY_CLOUDY,'daily aggregate must use the same cloud refinement');
assert.equal(daily.conditionSource,'CONSENSUS_VARIABLES');

const hourlyTimeline=buildTimelinePoints(forecast,'HOURLY',new Date(`${day}T11:35:00Z`));
assert.equal(hourlyTimeline[0]?.condition,CONDITION.PARTLY_CLOUDY,'hourly timeline must share the cloud refinement');

const single={city:{timezone:'UTC'},seriesByModel:{GFS:{
  hourly:{timestamps:[`${day}T00:00`,`${day}T06:00`,`${day}T12:00`,`${day}T18:00`],temperature2m:[18,20,22,19],precipitation:[0,0,0,0],precipitationProbability:[5,5,5,5],cloudCover:[25,45,65,85],windSpeed10m:[8,8,8,8],windGusts10m:[14,14,14,14],weatherCode:[3,3,3,3]},
  daily:{dates:[day],tempMin:[14],tempMax:[24],precipitationSum:[0],precipitationProbabilityMax:[5],windSpeedMax:[10],windGustsMax:[16],windDirection10mDominant:[180],weatherCode:[3],sunrise:[null],sunset:[null]},
}}};
const dailyTimeline=buildTimelinePoints(single,'DAILY',new Date(`${day}T00:00:00Z`));
assert.equal(dailyTimeline[0]?.condition,CONDITION.OVERCAST,'daily timeline must preserve the dominant hourly WMO sky condition for a single model');
assert.equal(dailyTimeline[0]?.conditionInferred,false);

console.log('Multi-family sky refinement across current, daily and timeline outputs: OK');
