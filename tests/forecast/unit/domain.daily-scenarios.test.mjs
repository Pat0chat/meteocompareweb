import assert from 'node:assert/strict';
import { buildDailyScenarios } from '../../../js/domain.js';

const now=new Date('2026-01-01T12:00:00Z');
const dates=['2026-01-01','2026-01-02','2026-01-03'];
function hourlyFor(date,{wetHours=[],cloud=20,temp=12}={}){
  const timestamps=Array.from({length:24},(_,hour)=>`${date}T${String(hour).padStart(2,'0')}:00`);
  return {
    timestamps,
    temperature2m:Array(24).fill(temp),
    precipitation:Array.from({length:24},(_,hour)=>wetHours.includes(hour)?1:0),
    weatherCode:Array.from({length:24},(_,hour)=>wetHours.includes(hour)?61:1),
    cloudCover:Array(24).fill(cloud),
    windGusts10m:Array(24).fill(30),
  };
}
function series({day1='rain',day2='clear',tempShift=0,gust=30,precip=4}={}){
  const wet1=day1==='rain'?[10,11,12,13]:[],wet2=day2==='rain'?[18,19,20]:[];
  const h1=hourlyFor('2026-01-02',{wetHours:wet1,cloud:day1==='rain'?85:20,temp:10+tempShift});
  const h2=hourlyFor('2026-01-03',{wetHours:wet2,cloud:day2==='rain'?85:20,temp:12+tempShift});
  return {
    daily:{
      dates,
      tempMax:[10,16+tempShift,18+tempShift],tempMin:[2,8+tempShift,9+tempShift],
      precipitationSum:[0,day1==='rain'?precip:0,day2==='rain'?precip:0],
      windGustsMax:[20,gust,gust+5],
      weatherCode:[1,day1==='rain'?61:1,day2==='rain'?61:1],
    },
    hourly:{
      timestamps:[...h1.timestamps,...h2.timestamps],
      temperature2m:[...h1.temperature2m,...h2.temperature2m],
      precipitation:[...h1.precipitation,...h2.precipitation],
      weatherCode:[...h1.weatherCode,...h2.weatherCode],
      cloudCover:[...h1.cloudCover,...h2.cloudCover],
      windGusts10m:[...h1.windGusts10m,...h2.windGusts10m],
    },
  };
}

const forecast={city:{timezone:'UTC'},seriesByModel:{
  ECMWF:series({day1:'rain',day2:'clear',tempShift:0,gust:38,precip:5}),
  ECMWF_AIFS:series({day1:'rain',day2:'clear',tempShift:2,gust:44,precip:7}),
  GFS:series({day1:'clear',day2:'rain',tempShift:4,gust:32,precip:3}),
  ICON_GLOBAL:series({day1:'rain',day2:'clear',tempShift:1,gust:40,precip:6}),
}};

const days=buildDailyScenarios(forecast,6,3,now);
assert.deepEqual(days.map(day=>day.date),['2026-01-02','2026-01-03'],'today must be excluded and only future calendar days returned');
assert.equal(days[0].scenarioCount,2);
assert.equal(days[0].scenarios[0].kind,'RAIN');
assert.equal(days[0].scenarios[0].timing,'MIDDLE');
assert.equal(days[0].scenarios[0].modelCount,3);
assert.equal(days[0].scenarios[0].familyCount,2,'ECMWF siblings plus ICON must count as two independent families, not three');
assert.equal(days[0].scenarios[0].totalFamilyCount,3,'four models with two ECMWF siblings must resolve to three independent families');
assert.equal(days[0].scenarios[0].voteSharePercent,67,'two rainy families out of three independent families must dominate');
assert.equal(days[0].scenarios[0].tempMin,8);
assert.equal(days[0].scenarios[0].tempMax,18);
assert.equal(days[0].scenarios[0].precipMin,5);
assert.equal(days[0].scenarios[0].precipMax,7);
assert.equal(days[0].scenarios[0].gustMin,38);
assert.equal(days[0].scenarios[0].gustMax,44);
assert.equal(days[1].scenarios[0].kind,'CLEAR','the dominant family on the following day must be calculated independently');
assert.equal(days[1].scenarios[0].timing,'NONE');


const threeScenarioForecast={city:{timezone:'UTC'},seriesByModel:{
  ...forecast.seriesByModel,
  METEOFRANCE_ARPEGE:{
    ...series({day1:'rain',day2:'clear',tempShift:-1,gust:47,precip:8}),
    daily:{
      ...series({day1:'rain',day2:'clear',tempShift:-1,gust:47,precip:8}).daily,
      weatherCode:[1,95,1],
    },
  },
}};
const three=buildDailyScenarios(threeScenarioForecast,2,3,now);
assert.equal(three.length,2,'J+1 and J+2 must remain available within the two-day scenario horizon');
assert.equal(three[0].scenarios.length,3,'J+1 must expose the three highest-ranked coherent scenarios when three exist');
assert.equal(three[0].scenarioCount,3);
assert.deepEqual(new Set(three[0].scenarios.map(s=>s.kind)),new Set(['RAIN','THUNDERSTORM','CLEAR']));


const extendedDates=['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05'];
const extendedSeries={
  daily:{
    dates:extendedDates,
    tempMax:[10,11,12,13,14],tempMin:[1,2,3,4,5],
    precipitationSum:[0,0,0,0,0],windGustsMax:[20,21,22,23,24],weatherCode:[1,1,1,1,1],
  },
  hourly:{timestamps:[],temperature2m:[],precipitation:[],weatherCode:[],cloudCover:[],windGusts10m:[]},
};
const extended=buildDailyScenarios({city:{timezone:'UTC'},seriesByModel:{GFS:extendedSeries,ICON_GLOBAL:extendedSeries}},4,3,now);
assert.deepEqual(extended.map(day=>day.date),['2026-01-02','2026-01-03','2026-01-04','2026-01-05'],'the selector horizon must expose the exact J+1 through J+4 calendar days');
assert.ok(extended.every(day=>day.scenarios.length>=1&&day.scenarios.length<=3),'each J+1..J+4 horizon must remain bounded to three displayed scenarios');

const limited=buildDailyScenarios(forecast,1,1,now);
assert.equal(limited.length,1);
assert.equal(limited[0].scenarios.length,1);
assert.equal(limited[0].scenarioCount,2,'display limiting must not hide the number of alternative coherent variants');
assert.ok(limited[0].scenarios.every(s=>!Object.hasOwn(s,'probability')),'family weight must never be presented as meteorological probability');

console.log('daily scenarios: future-day isolation, family balancing, timing and ranges: OK');
