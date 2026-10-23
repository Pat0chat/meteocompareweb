import assert from 'node:assert/strict';
import { getUvForecastCached, freshUvEntry, uvLocationKey, UV_REFRESH_TTL_MS, UV_ERROR_RETRY_MS } from '../../../js/uv-cache.js';
import { normalizeForecastPayload } from '../../../js/data/contracts.js';

const city={id:'paris',name:'Paris',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris'};
const otherId={...city,id:'another-favorite'};
const uv={hourly:{time:['2026-10-11T11:00'],uv_index:[3.6]},daily:{time:['2026-10-11'],uv_index_max:[5.7]}};
let now=Date.parse('2026-10-11T09:00:00Z'),calls=0,release;
const blocked=new Promise(resolve=>{release=resolve;});
const request=async()=>{calls++;await blocked;return uv;};

// Identical UV requests by two favorite cards (even different city IDs) must be coalesced.
const a=getUvForecastCached(city,7,null,request,()=>now);
const b=getUvForecastCached(otherId,7,null,request,()=>now);
assert.equal(calls,1,'only one UV request must be launched for concurrent equivalent locations');
release();
const [first,second]=await Promise.all([a,b]);
assert.deepEqual(first,second);
assert.equal(first.uv.daily.uvIndexMax[0],5.7);
assert.equal(first.uvForecastDays,7);
assert.equal(first.uvRequestKey,uvLocationKey(city));

// Repeated manual or automatic weather refreshes may not trigger fresh UV calls.
now+=15*60_000;
const fromMemory=await getUvForecastCached(city,7,null,async()=>{calls++;return uv;},()=>now);
assert.deepEqual(fromMemory,first);
assert.equal(calls,1);
const persistedForecast={...structuredClone(first),fetchedAt:new Date(now-147*60_000).toISOString(),
  requestedModelIds:['GFS'],seriesByModel:{GFS:{hourly:{temperature2m:[-8]}}}};
const fromPersisted=await getUvForecastCached(city,7,persistedForecast,async()=>{calls++;return uv;},()=>now);
assert.deepEqual(Object.keys(fromPersisted).sort(),['uv','uvFetchedAt','uvForecastDays','uvRequestKey'].sort(),
  'a persisted UV cache hit must not carry any old weather or timestamp fields');
assert.deepEqual(fromPersisted,first);
assert.equal(calls,1);
const shorter=await getUvForecastCached(city,3,first,async()=>{calls++;return uv;},()=>now);
assert.deepEqual(shorter,first,'smaller forecast horizons must reuse longer UV forecasts');
assert.equal(calls,1);

// Persisted metadata survives the normalized forecast contract (e.g. after a reload).
const stored=normalizeForecastPayload({
  city, timezone:city.timezone, fetchedAt:new Date(now).toISOString(), requestedModelIds:['GFS'],
  seriesByModel:{GFS:{hourly:{timestamps:[],temperature2m:[]},daily:{dates:[]}}},
  ...first,
},{cityId:'paris'});
// The minimal series may be rejected by strict model validation; this policy is
// tested separately from the storage contract in uv-index.pipeline.test.mjs.
if(stored){assert.equal(stored.uvFetchedAt,first.uvFetchedAt);assert.equal(stored.uvForecastDays,7);}

// A requested extension of the UV horizon is a valid reason to fetch again.
now+=60_000;
const expanded=await getUvForecastCached(city,9,first,async()=>{calls++;return uv;},()=>now);
assert.equal(calls,2);
assert.equal(expanded.uvForecastDays,9);
assert.equal(freshUvEntry(expanded,city,9,now),true);

// Local midnight invalidates the rolling Open-Meteo day even before the 3-hour TTL.
now=Date.parse('2026-10-11T21:45:00Z');
const rolloverCity={...city,latitude:48.867};
const late=await getUvForecastCached(rolloverCity,7,null,async()=>{calls++;return uv;},()=>now);
now=Date.parse('2026-10-11T22:15:00Z');
assert.equal(freshUvEntry(late,rolloverCity,7,now),false);
await getUvForecastCached(rolloverCity,7,late,async()=>{calls++;return uv;},()=>now);
assert.equal(calls,4,'UV must be reloaded on a new local calendar day');

// Three-hour expiry forces a refresh regardless of the main weather interval.
const ttlCity={...city,latitude:48.878};
now=Date.parse('2026-10-11T09:00:00Z');
const ttlEntry=await getUvForecastCached(ttlCity,7,null,async()=>{calls++;return uv;},()=>now);
now+=UV_REFRESH_TTL_MS;
assert.equal(freshUvEntry(ttlEntry,ttlCity,7,now),false);
await getUvForecastCached(ttlCity,7,ttlEntry,async()=>{calls++;return uv;},()=>now);
assert.equal(calls,6);

// City coordinates and timezone are part of the cache identity.
now=Date.parse('2026-10-11T09:00:00Z');
assert.equal(freshUvEntry(ttlEntry,{...ttlCity,longitude:2.4},7,now),false);
assert.equal(freshUvEntry(ttlEntry,{...ttlCity,timezone:'UTC'},7,now),false);
const displaced=await getUvForecastCached({...city,longitude:2.4},7,first,async()=>{calls++;return uv;},()=>now);
assert.ok(displaced);
assert.equal(calls,7);

// Errors and empty UV payloads degrade gracefully and are retried only after a cooldown.
const failedCity={...city,latitude:47.99};
now=Date.parse('2026-10-11T09:00:00Z');
let failures=0;
const failure=async()=>{failures++;throw new Error('UV provider offline');};
assert.equal(await getUvForecastCached(failedCity,7,null,failure,()=>now),null);
assert.equal(await getUvForecastCached(failedCity,7,null,failure,()=>now),null);
assert.equal(failures,1,'the UV endpoint should not be hammered after an error');
now+=UV_ERROR_RETRY_MS-1;
assert.equal(await getUvForecastCached(failedCity,7,null,failure,()=>now),null);
assert.equal(failures,1);
now+=1;
assert.equal(await getUvForecastCached(failedCity,7,null,async()=>{failures++;return {};},()=>now),null);
assert.equal(failures,2);
now+=UV_ERROR_RETRY_MS;
assert.ok(await getUvForecastCached(failedCity,7,null,async()=>{failures++;return uv;},()=>now));
assert.equal(failures,3);
assert.equal(await getUvForecastCached(failedCity,7,null,failure,()=>now).then(x=>x?.uv?.daily.uvIndexMax[0]),5.7);
assert.equal(failures,3,'a successful retry should immediately be cached');

console.log('UV cache: concurrency, persistence, TTL, day rollover, horizon, location and failure backoff: OK');
