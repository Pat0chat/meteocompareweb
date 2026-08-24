import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addDays } from '../../../js/domain.js';
import { getModel } from '../../../js/models.js';
import { normalizeSettings, normalizeCities, normalizeForecastPayload, forecastPayloadIssues } from '../../../js/data/contracts.js';
import { hourlySeriesHealth } from '../../../js/data/forecast-normalizer.js';
import { computeBiases } from '../../../js/features/bias.js';
import { normalizeMarine, marineCacheFresh } from '../../../js/features/marine.js';
import { FeatureRegistry } from '../../../js/core/feature-registry.js';
import { OperationRegistry } from '../../../js/core/cache-registry.js';
import { APP_VERSION } from '../../../js/version.js';

const read=p=>fs.readFileSync(new URL(`../../../${p}`,import.meta.url),'utf8');
const version=APP_VERSION,versionJs=read('js/version.js'),sw=read('sw.js');
assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'application version must come from the centralized semantic version');
assert.match(versionJs,/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/APP_VERSION = globalThis\.METEOCOMPARE_APP_VERSION/);
assert.match(sw,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/,'PWA cache generation must use the centralized source');
assert.match(sw,/\.\/js\/data\/contracts\.js/);
assert.match(sw,/\.\/js\/data\/forecast-normalizer\.js/);

// Settings/cities are sanitized at the trust boundary.
assert.deepEqual(normalizeSettings({enabledModelIds:['GFS','GFS','REMOVED'],theme:'BROKEN',chartHorizon:999,density:'COMPACT'}).enabledModelIds,['GFS']);
assert.equal(normalizeSettings({theme:'BROKEN'}).theme,'SYSTEM');
assert.equal(normalizeSettings({chartHorizon:999}).chartHorizon,168);
assert.equal(normalizeSettings({density:'COMPACT'}).density,'COMPACT');
const cities=normalizeCities([
  {id:'paris',name:' Paris ',latitude:'48.8566',longitude:'2.3522',timezone:'Europe/Paris'},
  {id:'paris',name:'duplicate',latitude:1,longitude:2,timezone:'UTC'},
  {id:'bad-lat',latitude:91,longitude:2,timezone:'UTC'},
  {id:'bad-lon',latitude:2,longitude:181,timezone:'UTC'},
]);
assert.equal(cities.length,1);assert.equal(cities[0].name,'Paris');assert.equal(cities[0].latitude,48.8566);

function emptyDaily(){return {dates:[],tempMax:[],tempMin:[],precipitationSum:[],precipitationProbabilityMax:[],windSpeedMax:[],windGustsMax:[],windDirection10mDominant:[],weatherCode:[],sunrise:[],sunset:[]};}
function hourlySeries(n=3){
  const timestamps=Array.from({length:n},(_,i)=>`2026-08-20T${String(i).padStart(2,'0')}:00`);
  return {hourly:{timestamps,timestampEpochMs:timestamps.map((_,i)=>Date.UTC(2026,7,20,i)),temperature2m:timestamps.map((_,i)=>20+i),precipitation:timestamps.map(()=>0),precipitationProbability:timestamps.map(()=>10),cloudCover:timestamps.map(()=>30),windSpeed10m:timestamps.map(()=>12),windDirection10m:timestamps.map(()=>180),windGusts10m:timestamps.map(()=>20),weatherCode:timestamps.map(()=>1)},daily:emptyDaily()};
}
const city={id:'paris',name:'Paris',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris'};
const good=hourlySeries();
const bad=structuredClone(good);bad.hourly.temperature2m[1]='corrupt';
const payload={city,timezone:'Europe/Paris',fetchedAt:'2026-08-20T10:00:00.000Z',seriesByModel:{GFS:good,ECMWF:bad,REMOVED:good},modelMeta:{GFS:{ok:true},ECMWF:{bad:true}},errors:{ICON_D2:'MODEL_UNAVAILABLE',REMOVED:'x'},requestedModelIds:['GFS','REMOVED']};
assert.ok(forecastPayloadIssues(payload).some(x=>x.includes('ECMWF:HOURLY_temperature2m_INVALID')));
const normalized=normalizeForecastPayload(payload,{cityId:'paris'});
assert.deepEqual(Object.keys(normalized.seriesByModel),['GFS']);
assert.deepEqual(normalized.requestedModelIds,['GFS']);
assert.equal(normalized.errors.ICON_D2,'MODEL_UNAVAILABLE');
assert.equal(normalizeForecastPayload(payload,{cityId:'lyon'}),null,'a cache must never cross city IDs');

// Health detects fragmented critical data but tolerates a balanced short regional tail.
const fragmented=hourlySeries(24);for(const i of [5,10,15])for(const key of ['temperature2m','precipitation','windSpeed10m'])fragmented.hourly[key][i]=null;
assert.equal(hourlySeriesHealth(fragmented,getModel('GFS'),24).fragmented,true);
const short=hourlySeries(12);const shortHealth=hourlySeriesHealth(short,getModel('ICON_D2'),48);
assert.equal(shortHealth.shortRegional,true);assert.equal(shortHealth.degraded,false);

// Bias statistics ignore non-finite forecasts instead of poisoning the whole mean.
const today='2026-08-20',end=addDays(today,-6),start=addDays(end,-14),forecasts=[],observations=[];
let cursor=start,index=0;while(cursor<=end){forecasts.push({modelId:'GFS',variable:'TEMPERATURE',targetDate:cursor,value:index===3?NaN:20});observations.push({variable:'TEMPERATURE',targetDate:cursor,value:19});cursor=addDays(cursor,1);index++;}
const bias=computeBiases({reference:'ERA5',forecasts,observations},today);
assert.equal(bias.GFS.TEMPERATURE.sampleSize,14);assert.equal(bias.GFS.TEMPERATURE.ready,true);assert.equal(bias.GFS.TEMPERATURE.meanBias,1);

// Marine variables stay aligned to the same valid timestamp axis even for malformed provider arrays.
const marine=normalizeMarine({latitude:48.8,longitude:-4.5,timezone:'Europe/Paris',hourly:{time:['2026-08-20T00:00','bad','2026-08-20T02:00','2026-08-20T03:00'],wave_height:[1,2],wave_direction:[180,190,200,210],wave_period:[6,7,8,9],swell_wave_height:[.5,.6,.7,.8],swell_wave_direction:[170,180,190,200],swell_wave_period:[9,10,11,12],sea_surface_temperature:[18,19,20,21],sea_level_height_msl:[.1,.2,.3,.4]}},city);
assert.deepEqual(marine.hourly.timestamps,['2026-08-20T00:00','2026-08-20T02:00','2026-08-20T03:00']);
for(const key of ['waveHeight','waveDirection','wavePeriod','swellHeight','swellDirection','swellPeriod','seaSurfaceTemperature','seaLevelHeightMsl','timestampEpochMs'])assert.equal(marine.hourly[key].length,3,`${key} must align with marine time`);
assert.deepEqual(marine.hourly.waveHeight,[1,null,null]);
assert.equal(marineCacheFresh({fetchedAt:new Date(Date.now()+60_000).toISOString()}),false,'future-dated marine cache must not be fresh');

// Async infrastructure remains race-safe and failed lazy loads can be retried.
const ops=new OperationRegistry(),old=ops.begin('paris'),current=ops.begin('paris');assert.equal(ops.isCurrent('paris',old),false);assert.equal(ops.isCurrent('paris',current),true);
let attempts=0;const features=new FeatureRegistry({demo:async()=>{attempts++;if(attempts===1)throw new Error('temporary');return {ok:true};}});
await assert.rejects(features.load('demo'));assert.deepEqual(await features.load('demo'),{ok:true});assert.equal(attempts,2);

// Integrity audit can sanitize a recoverable current-schema record rather than deleting it.
class LocalStorageMock{constructor(){this.map=new Map();}get length(){return this.map.size;}key(i){return [...this.map.keys()][i]??null;}getItem(k){return this.map.has(String(k))?this.map.get(String(k)):null;}setItem(k,v){this.map.set(String(k),String(v));}removeItem(k){this.map.delete(String(k));}}
globalThis.localStorage=new LocalStorageMock();Object.defineProperty(globalThis,'indexedDB',{value:undefined,configurable:true});
localStorage.setItem('meteocompare.web.settings.v1',JSON.stringify({marker:'meteocompare.local-record',schemaVersion:3,kind:'settings',cityId:null,storedAt:Date.now(),payload:{enabledModelIds:['GFS','REMOVED'],theme:'BROKEN',density:'COMPACT'}}));
const storage=await import(`../../../js/storage.js?resilience=${Date.now()}`);
let report=await storage.verifyLocalDataIntegrity([city]);assert.ok(report.sanitized>=1);assert.ok(report.issues.some(x=>x.code==='SANITIZABLE_RECORD'));
report=await storage.verifyLocalDataIntegrity([city],{repair:true});assert.ok(report.repairs.some(x=>x.action==='SANITIZE'));
const repaired=JSON.parse(localStorage.getItem('meteocompare.web.settings.v1')).payload;assert.deepEqual(repaired.enabledModelIds,['GFS']);assert.equal(repaired.theme,'SYSTEM');

// A provider/model rejection in a mixed request must isolate the failing model
// instead of taking every healthy forecast down with it.
const networkCalls=[];
const priorFetch=globalThis.fetch;
const hourlyTimes=Array.from({length:24},(_,i)=>`2026-08-20T${String(i).padStart(2,'0')}:00`);
const healthyRaw={timezone:'Europe/Paris',hourly:{time:hourlyTimes,temperature_2m:hourlyTimes.map(()=>20),precipitation:hourlyTimes.map(()=>0),wind_speed_10m:hourlyTimes.map(()=>10)},daily:{time:[]}};
globalThis.fetch=async url=>{
  const parsed=new URL(String(url)),models=(parsed.searchParams.get('models')||'').split(',').filter(Boolean);networkCalls.push(models);
  const bad=models.length>1||models.includes('bom_access_global');
  return {ok:!bad,status:bad?400:200,headers:{get:()=>null},json:async()=>bad?{error:true,reason:'model unavailable'}:healthyRaw};
};
try{
  const api=await import(`../../../js/api.js?resilience-batch=${Date.now()}`);
  const partial=await api.fetchForecast(city,['GFS','BOM_ACCESS'],1);
  assert.ok(partial.seriesByModel.GFS,'healthy model must survive a rejected mixed-model batch');
  assert.equal(partial.seriesByModel.BOM_ACCESS,undefined);
  assert.equal(partial.errors.BOM_ACCESS,'HTTP_400');
  assert.deepEqual(partial.requestedModelIds,['GFS','BOM_ACCESS']);
  assert.equal(networkCalls.length,3,'fallback should make the failed batch plus one request per isolated model');
}finally{globalThis.fetch=priorFetch;}

console.log(`MeteoCompare Web ${APP_VERSION} stability contracts: OK`);
