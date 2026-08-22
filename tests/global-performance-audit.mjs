import fs from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { WEATHER_MODELS } from '../js/models.js';
import { aggregateDay, hourlyConfidenceBand, buildScenarios, buildTimelinePoints, cityToday, addDays } from '../js/domain.js';
import { computeBiases } from '../js/features/bias.js';
import { buildEvolution } from '../js/features/evolution.js';

const appSource=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const storageSource=fs.readFileSync(new URL('../js/storage.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');

assert.match(appSource,/const eagerForecastIds = new Set/,'startup must only hydrate forecasts synchronously for routes that need them');
assert.match(appSource,/function ensureCityAnalysisLoaded\(/,'bias, evolution and normals must be lazy-loaded per city');
assert.doesNotMatch(appSource,/state\.cities\.forEach\([\s\S]{0,500}loadBias\(/,'startup must not parse every city bias history');
assert.match(appSource,/function rerenderCitySection\(/,'local detail interactions should support section-only rerenders');
for(const pair of [
  ["confidenceMetric","agreement"],["chartHorizon","agreement"],["detailMode","details"],["detailTab","details"],
  ["timelineMode","timeline"],["evolutionVariable","evolution"],["reliabilityVariable","reliability"]
]) assert.match(appSource,new RegExp(`dataset\\.${pair[0]}[\\s\\S]{0,280}rerenderCitySectionOrPage\\('${pair[1]}'\\)`),`${pair[0]} should avoid rebuilding the whole city page`);
assert.match(appSource,/dataset\.compareModel[\s\S]{0,520}rerenderTargetedComparisonPanel\(\)/,'compareModel should rerender only the inner targeted comparison panel');
assert.match(storageSource,/async function mapLimited\(/,'cache-storage inspection must use bounded concurrency');
assert.match(storageSource,/mapLimited\(requests,6/,'PWA cache asset sizing should not be strictly sequential');
assert.match(workflow,/(?:npm run tests|global-performance-audit\.mjs|tests\/\*\.mjs)/,'GitHub Pages workflow must run global performance audit');

const city={id:'bench',name:'Bench',latitude:48.85,longitude:2.35,timezone:'Europe/Paris'};
const dateFmt=new Intl.DateTimeFormat('en-CA',{timeZone:city.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
const parts=d=>Object.fromEntries(dateFmt.formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
const now=new Date();
const hours=Array.from({length:168},(_,i)=>{const p=parts(new Date(now.getTime()+i*3600e3));return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;});
const days=[...new Set(hours.map(x=>x.slice(0,10)))].slice(0,7);
const seriesByModel={};
WEATHER_MODELS.forEach((m,k)=>{
  const temp=hours.map((_,i)=>12+9*Math.sin(i/12)+k*.17),precip=hours.map((_,i)=>Math.max(0,Math.sin((i+k)/9))*((k%4)+.2)),wind=hours.map((_,i)=>14+(k%6)*3+7*Math.abs(Math.sin(i/8)));
  seriesByModel[m.id]={hourly:{timestamps:hours,temperature2m:temp,precipitation:precip,precipitationProbability:precip.map(v=>Math.min(100,Math.round(v*24))),cloudCover:hours.map((_,i)=>(i*7+k*11)%100),windSpeed10m:wind,windGusts10m:wind.map(v=>v+10),windDirection10m:hours.map((_,i)=>(i*12+k*17)%360),weatherCode:hours.map((_,i)=>precip[i]>.8?61:2)},daily:{dates:days,tempMax:days.map((_,i)=>22+i*.5+k*.12),tempMin:days.map((_,i)=>11+i*.2+k*.08),precipitationSum:days.map((_,i)=>(i%3)*2+k*.05),precipitationProbabilityMax:days.map((_,i)=>30+(i*7+k)%65),windSpeedMax:days.map((_,i)=>22+i*2+(k%5)*2),windGustsMax:days.map((_,i)=>34+i*2+(k%5)*2),windDirection10mDominant:days.map((_,i)=>(200+i*10+k*8)%360),weatherCode:days.map((_,i)=>i%3===1?61:2),sunrise:days.map(d=>d+'T06:30'),sunset:days.map(d=>d+'T20:40')}};
});
const forecast={city,seriesByModel,fetchedAt:new Date().toISOString()};
const today=cityToday(city.timezone),observations=[],forecasts=[];
for(let di=30;di>=1;di--){const date=addDays(today,-di);for(const [variable,base] of [['TEMPERATURE',20],['PRECIPITATION',2],['WIND_SPEED',25]]){const obs=base+(di%5)*.4;observations.push({variable,targetDate:date,value:obs});WEATHER_MODELS.forEach((m,k)=>forecasts.push({modelId:m.id,variable,targetDate:date,value:obs+(k-8)*.12}));}}
const snapshots=Array.from({length:40},(_,si)=>({capturedAt:Date.now()-(40-si)*3*3600e3,daily:Object.fromEntries(days.map((d,di)=>[d,Object.fromEntries(WEATHER_MODELS.map((m,k)=>[m.id,{temperature:22+di+k*.1+si*.01,precipitation:(di%3)*2+k*.03+si*.002,wind:24+di+k*.2+si*.01}]))]))}));

function timed(fn){const t0=performance.now();fn();return performance.now()-t0;}
// Warm JIT once, then assert generous upper bounds suitable for GitHub-hosted runners.
days.forEach(d=>aggregateDay(forecast,d));hourlyConfidenceBand(forecast,'TEMPERATURE',168);buildScenarios(forecast);buildTimelinePoints(forecast,24);computeBiases({forecasts,observations},today);buildEvolution(forecast,snapshots);
const measurements={
  sevenDayAggregation:timed(()=>days.forEach(d=>aggregateDay(forecast,d))),
  threeBands:timed(()=>['TEMPERATURE','PRECIPITATION','WIND'].forEach(m=>hourlyConfidenceBand(forecast,m,168))),
  scenarios:timed(()=>buildScenarios(forecast)),
  timeline:timed(()=>buildTimelinePoints(forecast,24)),
  bias:timed(()=>computeBiases({forecasts,observations},today)),
  evolution:timed(()=>buildEvolution(forecast,snapshots)),
};
for(const [name,ms] of Object.entries(measurements)) assert.ok(ms<120,`${name} unexpectedly slow: ${ms.toFixed(1)} ms`);
console.log('MeteoCompare Web global performance audit: OK',Object.fromEntries(Object.entries(measurements).map(([k,v])=>[k,`${v.toFixed(2)}ms`])));
