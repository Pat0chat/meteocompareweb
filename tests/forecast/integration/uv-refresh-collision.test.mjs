import assert from 'node:assert/strict';
import { fetchForecast } from '../../../js/api.js';
import { forecastRefreshVerified } from '../../../js/core/app-state.js';

// Two overdue city cards with valid cached UV must both receive freshly fetched
// weather; reusing UV cannot resurrect old model selections or timestamps.
const today=new Date();today.setUTCMinutes(0,0,0);
const hours=Array.from({length:168},(_,i)=>new Date(today.getTime()+i*3600_000).toISOString().slice(0,16));
const days=Array.from({length:7},(_,i)=>new Date(today.getTime()+i*86_400_000).toISOString().slice(0,10));
const weather={timezone:'UTC',hourly:{time:hours,temperature_2m:Array(168).fill(16),
  precipitation:Array(168).fill(0),wind_speed_10m:Array(168).fill(8),weather_code:Array(168).fill(2)},daily:{time:days}};
const uv={hourly:{time:hours,uv_index:Array(168).fill(3)},daily:{time:days,uv_index_max:Array(7).fill(5)}};
let weatherCalls=0,uvCalls=0;
globalThis.fetch=async url=>{
  const u=new URL(String(url));
  if(u.searchParams.get('hourly')==='uv_index') {uvCalls++;return new Response(JSON.stringify(uv));}
  weatherCalls++;
  return new Response(JSON.stringify(weather));
};
const paris={id:'cache-uv-paris',name:'Paris',latitude:48.8566,longitude:2.3522,timezone:'UTC'};
const lyon={id:'cache-uv-lyon',name:'Lyon',latitude:45.7578,longitude:4.8320,timezone:'UTC'};
const [firstParis,firstLyon]=await Promise.all([
  fetchForecast(paris,['GFS'],7),fetchForecast(lyon,['ECMWF'],7),
]);
assert.equal(weatherCalls,2);
assert.equal(uvCalls,2);
const old=new Date(Date.now()-147*60_000).toISOString();
const cachedParis=structuredClone(firstParis),cachedLyon=structuredClone(firstLyon);
for(const cached of [cachedParis,cachedLyon]) {
  cached.fetchedAt=old;
  for(const series of Object.values(cached.seriesByModel))series.hourly.temperature2m[0]=-9;
}
const startedAt=Date.now();
const [newParis,newLyon]=await Promise.all([
  fetchForecast(paris,['GFS'],7,cachedParis),
  fetchForecast(lyon,['GFS'],7,cachedLyon), // model selection changed since prior cache
]);
for(const forecast of [newParis,newLyon]) {
  assert.equal(forecastRefreshVerified(forecast,['GFS'],startedAt),true,
    'cached UV must not make an automatic or manual weather refresh look unverified');
  assert.notEqual(forecast.fetchedAt,old);
  assert.equal(forecast.seriesByModel.GFS.hourly.temperature2m[0],16,
    'freshly downloaded temperature must win over persisted weather');
  assert.ok(forecast.uv);
  assert.deepEqual(forecast.requestedModelIds,['GFS']);
}
assert.equal(Object.hasOwn(newLyon.seriesByModel,'ECMWF'),false,
  'old enabled models must not return via UV reuse');
assert.equal(weatherCalls,4,'each of two overdue cities makes exactly one new weather request');
assert.equal(uvCalls,2,'cached UV must avoid extra UV network requests');
console.log('Two-city UV cache regression: weather timestamps and models remain fresh without additional requests: OK');
