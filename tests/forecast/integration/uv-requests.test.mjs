import assert from 'node:assert/strict';
import { fetchForecast } from '../../../js/api.js';
import { normalizeForecastPayload } from '../../../js/data/contracts.js';
import { forecastRefreshVerified } from '../../../js/core/app-state.js';

const city={id:'uv-network-check',name:'Example',latitude:54.234567,longitude:8.765432,timezone:'UTC'};
const now=new Date();now.setUTCMinutes(0,0,0);
const hours=Array.from({length:168},(_,i)=>new Date(now.getTime()+i*3600_000).toISOString().slice(0,16));
const dates=Array.from({length:7},(_,i)=>new Date(now.getTime()+i*86_400_000).toISOString().slice(0,10));
const weather={timezone:'UTC',hourly:{time:hours,
  temperature_2m:Array(168).fill(17),precipitation:Array(168).fill(0),wind_speed_10m:Array(168).fill(10),
  weather_code:Array(168).fill(1)},daily:{time:dates}};
const uv={hourly:{time:hours,uv_index:hours.map((_,i)=>i%24)},daily:{time:dates,uv_index_max:Array(7).fill(7)}};
let mainCalls=0,uvCalls=0;
const fetcher=async url=>{
  const u=new URL(String(url));
  if(u.searchParams.get('hourly')==='uv_index'){uvCalls++;return new Response(JSON.stringify(uv),{status:200});}
  mainCalls++;return new Response(JSON.stringify(weather),{status:200});
};
globalThis.fetch=fetcher;

const first=await fetchForecast(city,['GFS'],7);
assert.equal(mainCalls,1);
assert.equal(uvCalls,1);
assert.ok(first.uv);
assert.ok(first.uvFetchedAt);
assert.equal(first.uvForecastDays,7);

// Deliberately re-fetch the weather, using the forecast that was actually stored.
const restored=normalizeForecastPayload(structuredClone(first),{cityId:city.id});
assert.equal(restored.uvFetchedAt,first.uvFetchedAt,'cache timestamp must survive persistence');
assert.equal(restored.uvRequestKey,first.uvRequestKey,'location key must survive persistence');
assert.equal(restored.uvForecastDays,7,'horizon must survive persistence');
// Regression: a persisted UV hit must never resurrect the previous weather forecast.
restored.fetchedAt=new Date(Date.now()-147*60_000).toISOString();
restored.seriesByModel.GFS.hourly.temperature2m[0]=-8;
const refreshedAt=Date.now();
const second=await fetchForecast(city,['GFS'],7,restored);
assert.ok(forecastRefreshVerified(second,['GFS'],refreshedAt),'a genuine weather response must pass the refresh verification even when UV is cached');
assert.ok(Date.now()-Date.parse(second.fetchedAt)<10_000,'UV cache must not restore the previous 2 h 27 timestamp');
assert.equal(second.seriesByModel.GFS.hourly.temperature2m[0],17,'cached UV must not overwrite newly downloaded weather values');
assert.deepEqual(second.requestedModelIds,['GFS']);
assert.equal(mainCalls,2,'the core weather forecast should still refresh');
assert.equal(uvCalls,1,'recent UV must not refresh with weather');
assert.deepEqual(second.uv,first.uv,'UV must survive a manual weather refresh');

const third=await fetchForecast({...city,id:'other-city-card'},['GFS'],7);
assert.equal(mainCalls,3,'weather may refresh independently of the UV cache');
assert.equal(uvCalls,1,'repeated UV request at same coordinates must hit UV memory cache');
assert.ok(third.uv);
assert.deepEqual(third.requestedModelIds,['GFS']);

// Parallel model forecasts (different city IDs but the same location) still share UV.
const another={...city,latitude:54.345678};
await Promise.all([fetchForecast(another,['GFS'],7),fetchForecast({...another,id:'same-location'},['GFS'],7)]);
assert.equal(uvCalls,2,'parallel requests for the same location must make a single UV API call');

// A failed main forecast must not waste a UV network call.
const missing={...city,latitude:54.456789};
globalThis.fetch=async url=>{
  const u=new URL(String(url));
  if(u.searchParams.get('hourly')==='uv_index')uvCalls++;
  throw new Error('forecast provider temporarily down');
};
await assert.rejects(fetchForecast(missing,['GFS'],7));
assert.equal(uvCalls,2,'UV must not load when the weather forecast itself fails');

console.log('UV network calls: unchanged main refresh, reuse across reloads, concurrent deduplication, failed weather: OK');
