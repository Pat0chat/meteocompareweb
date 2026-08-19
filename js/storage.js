import { DEFAULT_MODEL_IDS } from './models.js';
import { APP_VERSION, BACKUP_FORMAT_VERSION } from './version.js';
import { dailyMetricIsComparable } from './domain.js';

const SETTINGS_KEY = 'meteocompare.web.settings.v1';
const CITIES_KEY = 'meteocompare.web.cities.v1';
const FORECAST_PREFIX = 'meteocompare.web.forecast.';
const EVOLUTION_PREFIX = 'meteocompare.web.evolution.';
const NORMALS_PREFIX = 'meteocompare.web.normals.era5-v1.';
const BIAS_PREFIX = 'meteocompare.web.bias.';
const MARINE_PREFIX = 'meteocompare.web.marine.';
const HEALTH_PREFIX = 'meteocompare.web.health.';
const ANALYTICS_OPTOUT_KEY = 'meteocompare.web.analytics.optout.v1';
const DB_NAME = 'meteocompare.web.large-cache.v1';
const DB_STORE = 'cache';
const DB_VERSION = 2;
const PWA_CACHE_PREFIX = 'meteocompare-web-';
export const DATA_SCHEMA_VERSION = 3;
const RECORD_MARKER = 'meteocompare.local-record';
const storageIssues = new Map();
function storageIssue(code,detail={}){const key=`${code}|${detail.key||''}`;storageIssues.set(key,{code,detail,at:Date.now()});}
export function getStorageIssues(){return [...storageIssues.values()];}
export function clearStorageIssues(){storageIssues.clear();}

export const defaultSettings = {
  enabledModelIds: DEFAULT_MODEL_IDS,
  theme: 'SYSTEM',
  language: 'SYSTEM',
  refreshInterval: 'HOUR_1',
  modelSort: 'ZONE',
  detailViewMode: 'DAILY',
  detailTab: 'CONDITIONS',
  confidenceMetric: 'TEMPERATURE',
  chartHorizon: 168,
  timelineMode: 'HOURLY',
  density: 'COMFORTABLE',
  localWeightedConsensus: false,
  collapsedSections: {},
};

function safeParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (err) {
    const quota=err?.name==='QuotaExceededError'||err?.name==='NS_ERROR_DOM_QUOTA_REACHED';
    storageIssue(quota?'STORAGE_QUOTA':'LOCAL_STORAGE_UNAVAILABLE',{key,message:String(err?.message||err||'')});
    console.warn(`Stockage local indisponible pour ${key}:`, err); return false;
  }
}
function safeRemove(key) { try { localStorage.removeItem(key); } catch {} }

function recordKindForKey(key){
  if(key===SETTINGS_KEY)return 'settings';if(key===CITIES_KEY)return 'cities';
  if(key.startsWith(FORECAST_PREFIX))return 'forecast';if(key.startsWith(EVOLUTION_PREFIX))return 'evolution';
  if(key.startsWith(NORMALS_PREFIX))return 'normals';if(key.startsWith(BIAS_PREFIX))return 'bias';if(key.startsWith(MARINE_PREFIX))return 'marine';if(key.startsWith(HEALTH_PREFIX))return 'health';return null;
}
function recordContext(key){const kind=recordKindForKey(key);if(!kind)return {kind:null,cityId:null};const prefixes={forecast:FORECAST_PREFIX,evolution:EVOLUTION_PREFIX,normals:NORMALS_PREFIX,bias:BIAS_PREFIX,marine:MARINE_PREFIX,health:HEALTH_PREFIX};return {kind,cityId:prefixes[kind]?key.slice(prefixes[kind].length):null};}
function envelope(kind,payload,{cityId=null,storedAt=Date.now()}={}){return {marker:RECORD_MARKER,schemaVersion:DATA_SCHEMA_VERSION,kind,cityId,storedAt,payload};}
function isEnvelope(value){return Boolean(value&&typeof value==='object'&&value.marker===RECORD_MARKER&&Number.isFinite(value.schemaVersion)&&'payload' in value);}
function migrateV1ToV2(kind,payload,context={}){return {marker:RECORD_MARKER,schemaVersion:2,kind,cityId:context.cityId||null,storedAt:Date.now(),payload};}
function migrateV2ToV3(record,context={}){return {...record,marker:RECORD_MARKER,schemaVersion:3,kind:record.kind||context.kind,cityId:record.cityId??context.cityId??null,storedAt:Number(record.storedAt)||Date.now()};}
function migrateRecord(kind,value,context={}){
  let record=isEnvelope(value)?value:migrateV1ToV2(kind,value,context),fromVersion=isEnvelope(value)?Number(value.schemaVersion):1;
  if(record.schemaVersion===1)record=migrateV1ToV2(kind,record.payload??record,context);
  if(record.schemaVersion===2)record=migrateV2ToV3(record,context);
  if(record.schemaVersion>DATA_SCHEMA_VERSION)return {record,payload:null,fromVersion,valid:false,error:'FUTURE_SCHEMA'};
  if(record.schemaVersion!==DATA_SCHEMA_VERSION)return {record,payload:null,fromVersion,valid:false,error:'UNSUPPORTED_SCHEMA'};
  return {record,payload:record.payload,fromVersion,migrated:fromVersion!==DATA_SCHEMA_VERSION,valid:true};
}
function validatePayload(kind,payload){
  if(kind==='settings')return Boolean(payload&&typeof payload==='object'&&!Array.isArray(payload));
  if(kind==='cities')return Array.isArray(payload)&&payload.every(x=>x&&typeof x==='object'&&x.id!=null);
  if(kind==='forecast')return Boolean(payload&&typeof payload==='object'&&payload.city&&payload.seriesByModel&&typeof payload.seriesByModel==='object'&&Object.keys(payload.seriesByModel).length&&typeof payload.fetchedAt==='string');
  if(kind==='evolution')return Array.isArray(payload)&&payload.every(x=>x&&Number.isFinite(x.capturedAt)&&x.daily&&typeof x.daily==='object');
  if(kind==='normals')return Boolean(payload&&typeof payload==='object'&&payload.normals&&typeof payload.normals==='object');
  if(kind==='bias')return Boolean(payload&&typeof payload==='object'&&Array.isArray(payload.forecasts)&&Array.isArray(payload.observations));
  if(kind==='marine')return Boolean(payload&&typeof payload==='object'&&typeof payload.fetchedAt==='string'&&payload.hourly&&Array.isArray(payload.hourly.timestamps));
  if(kind==='health')return Array.isArray(payload)&&payload.every(x=>x&&Number.isFinite(x.capturedAt)&&Array.isArray(x.rows));
  return true;
}
function readLocalRecord(key,kind,fallback){
  const raw=safeParse(localStorage.getItem(key),null);if(raw==null)return fallback;
  const ctx={...recordContext(key),kind};const migrated=migrateRecord(kind,raw,ctx);
  if(!migrated.valid||!validatePayload(kind,migrated.payload)){storageIssue('CORRUPT_LOCAL_RECORD',{key,kind,error:migrated.error||'INVALID_PAYLOAD'});return fallback;}
  if(migrated.migrated)safeSet(key,migrated.record);
  return migrated.payload;
}
function writeLocalRecord(key,kind,payload){const ctx=recordContext(key);return safeSet(key,envelope(kind,payload,{cityId:ctx.cityId}));}

function openDb() {
  if (typeof indexedDB === 'undefined') { storageIssue('INDEXEDDB_UNAVAILABLE',{message:'IndexedDB API unavailable'}); return Promise.resolve(null); }
  return new Promise(resolve => {
    let req;
    try { req=indexedDB.open(DB_NAME, DB_VERSION); } catch(err) { storageIssue('INDEXEDDB_UNAVAILABLE',{message:String(err?.message||err||'open failed')}); resolve(null); return; }
    req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>{storageIssue('INDEXEDDB_UNAVAILABLE',{message:String(req.error?.message||'open failed')});resolve(null);};
    req.onblocked=()=>{storageIssue('INDEXEDDB_BLOCKED',{});resolve(null);};
  });
}
let dbPromise=null;
function db(){ return dbPromise ||= openDb(); }
async function idbGet(key){
  const database=await db(); if(!database)return null;
  return new Promise(resolve=>{try{const tx=database.transaction(DB_STORE,'readonly'),req=tx.objectStore(DB_STORE).get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>resolve(null);}catch{resolve(null);}});
}
async function idbPut(key,value){
  const database=await db(); if(!database)return false;
  return new Promise(resolve=>{try{const tx=database.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>{const err=tx.error;storageIssue(err?.name==='QuotaExceededError'?'STORAGE_QUOTA':'INDEXEDDB_WRITE_FAILED',{key,message:String(err?.message||'')});resolve(false);};tx.onabort=()=>{const err=tx.error;storageIssue(err?.name==='QuotaExceededError'?'STORAGE_QUOTA':'INDEXEDDB_WRITE_FAILED',{key,message:String(err?.message||'')});resolve(false);};}catch(err){storageIssue('INDEXEDDB_WRITE_FAILED',{key,message:String(err?.message||err||'')});resolve(false);}});
}
async function idbDelete(key){
  const database=await db(); if(!database)return false;
  return new Promise(resolve=>{try{const tx=database.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}catch{resolve(false);}});
}

export function loadSettings() {
  const parsed = readLocalRecord(SETTINGS_KEY,'settings',{});
  return { ...defaultSettings, ...parsed, enabledModelIds: Array.isArray(parsed.enabledModelIds) && parsed.enabledModelIds.length ? parsed.enabledModelIds : DEFAULT_MODEL_IDS };
}
export function saveSettings(settings) { writeLocalRecord(SETTINGS_KEY,'settings',settings); }
export function loadCities() { const v=readLocalRecord(CITIES_KEY,'cities',[]); return Array.isArray(v)?v:[]; }
export function saveCities(cities) { writeLocalRecord(CITIES_KEY,'cities',cities); }

/* Forecast payloads are the largest records (17 models × hourly arrays).
   Keep legacy localStorage reads for migration, but persist new payloads in IndexedDB
   so several cities do not exhaust the small synchronous localStorage quota. */
export function loadForecast(cityId) { return readLocalRecord(FORECAST_PREFIX+cityId,'forecast',null); }
export async function loadForecastAsync(cityId) {
  const key=FORECAST_PREFIX+cityId;
  const legacy=loadForecast(cityId);
  if(legacy){
    if(await idbPut(key,envelope('forecast',legacy,{cityId})))safeRemove(key);
    return legacy;
  }
  const stored=await idbGet(key);if(stored==null)return null;const migrated=migrateRecord('forecast',stored,{kind:'forecast',cityId});if(!migrated.valid||!validatePayload('forecast',migrated.payload)){storageIssue('CORRUPT_IDB_RECORD',{key,kind:'forecast'});return null;}if(migrated.migrated)void idbPut(key,migrated.record);return migrated.payload;
}
export async function saveForecast(cityId, forecast) {
  const key=FORECAST_PREFIX+cityId;
  if(typeof indexedDB==='undefined'){writeLocalRecord(key,'forecast',forecast);storageIssue('INDEXEDDB_UNAVAILABLE',{key});return;}
  const ok=await idbPut(key,envelope('forecast',forecast,{cityId}));
  if(ok)safeRemove(key);else writeLocalRecord(key,'forecast',forecast);
}
export function deleteForecast(cityId) { const key=FORECAST_PREFIX+cityId; safeRemove(key); void idbDelete(key); }
export function deleteCityData(cityId) {
  safeRemove(EVOLUTION_PREFIX+cityId);
  safeRemove(NORMALS_PREFIX+cityId);
  safeRemove(BIAS_PREFIX+cityId);
  safeRemove(MARINE_PREFIX+cityId);
  safeRemove(HEALTH_PREFIX+cityId);
  deleteForecast(cityId);
}

export function loadEvolution(cityId) { const v=readLocalRecord(EVOLUTION_PREFIX+cityId,'evolution',[]); return Array.isArray(v)?v:[]; }
export function saveEvolution(cityId, entries) { writeLocalRecord(EVOLUTION_PREFIX+cityId,'evolution',entries); }

export function recordEvolutionSnapshot(cityId, forecast) {
  const now = Date.now();
  const previous = loadEvolution(cityId).filter(x => Number.isFinite(x.capturedAt) && now - x.capturedAt <= 5*24*3600e3);
  // v2 snapshots guarantee that terminal PARTIAL civil days never enter run-to-run comparisons.
  // Force one audited snapshot after upgrade even if a legacy capture is less than three hours old.
  if (previous.some(x => x?.qualityVersion===2 && Math.abs(now - x.capturedAt) < 3*3600e3)) return previous;
  const daily = {};
  for (const [modelId, series] of Object.entries(forecast.seriesByModel || {})) {
    series.daily.dates.forEach((date, i) => {
      daily[date] ||= {};
      daily[date][modelId] = {
        temperature: dailyMetricIsComparable(series,i,'temperature') ? finiteOrNull(series.daily.tempMax[i]) : null,
        precipitation: dailyMetricIsComparable(series,i,'precipitation') ? nonNegativeOrNull(series.daily.precipitationSum[i]) : null,
        wind: dailyMetricIsComparable(series,i,'wind') ? nonNegativeOrNull(series.daily.windSpeedMax[i]) : null,
      };
    });
  }
  const next = [...previous, { capturedAt: now, qualityVersion:2, daily }].sort((a,b)=>a.capturedAt-b.capturedAt).slice(-40);
  saveEvolution(cityId, next);
  return next;
}

export function loadNormals(cityId) { return readLocalRecord(NORMALS_PREFIX+cityId,'normals',null); }
export function saveNormals(cityId, payload) { writeLocalRecord(NORMALS_PREFIX+cityId,'normals',payload); }
export function loadBias(cityId) { return readLocalRecord(BIAS_PREFIX+cityId,'bias',{ forecasts:[], observations:[], updatedAt:null }); }
export function saveBias(cityId, data) { writeLocalRecord(BIAS_PREFIX+cityId,'bias',data); }
export function loadMarine(cityId) { return readLocalRecord(MARINE_PREFIX+cityId,'marine',null); }
export function saveMarine(cityId, data) { writeLocalRecord(MARINE_PREFIX+cityId,'marine',data); }
export function loadModelHealth(cityId) { const v=readLocalRecord(HEALTH_PREFIX+cityId,'health',[]); return Array.isArray(v)?v:[]; }
export function saveModelHealth(cityId, entries) { writeLocalRecord(HEALTH_PREFIX+cityId,'health',entries); }

function finiteOrNull(v){ return Number.isFinite(v)?v:null; }
function nonNegativeOrNull(v){ return Number.isFinite(v)&&v>=0?v:null; }


function textBytes(text) {
  const value=String(text??'');
  try { return new TextEncoder().encode(value).byteLength; } catch { return value.length*2; }
}
function serializedBytes(value) {
  try { return textBytes(JSON.stringify(value)); } catch { return 0; }
}
function localStorageRecord(key) {
  try {
    const raw=localStorage.getItem(key);
    if(raw==null)return null;const parsed=safeParse(raw,null),ctx=recordContext(key),mig=ctx.kind?migrateRecord(ctx.kind,parsed,ctx):null;return {key,raw,bytes:textBytes(key)+textBytes(raw),value:mig?.valid?mig.payload:parsed,record:parsed,schemaVersion:mig?.record?.schemaVersion??null};
  } catch { return null; }
}
async function idbListEntries() {
  const database=await db(); if(!database)return [];
  return new Promise(resolve=>{
    const out=[];
    try {
      const tx=database.transaction(DB_STORE,'readonly'),store=tx.objectStore(DB_STORE),req=store.openCursor();
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve(out);return;}{const key=String(cursor.key),raw=cursor.value,ctx=recordContext(key),mig=ctx.kind?migrateRecord(ctx.kind,raw,ctx):null;out.push({key,value:mig?.valid?mig.payload:raw,raw,bytes:textBytes(key)+serializedBytes(raw),schemaVersion:mig?.record?.schemaVersion??null});}cursor.continue();};
      req.onerror=()=>resolve(out);
    } catch { resolve(out); }
  });
}
async function mapLimited(items,limit,worker){
  const out=new Array(items.length);let cursor=0;
  const runners=Array.from({length:Math.min(Math.max(1,limit),items.length)},async()=>{while(cursor<items.length){const i=cursor++;out[i]=await worker(items[i],i);}});
  await Promise.all(runners);return out;
}
async function cacheStorageStats(){
  if(typeof caches==='undefined')return {bytes:0,entries:0,caches:[]};
  const result={bytes:0,entries:0,caches:[]};
  try {
    const names=(await caches.keys()).filter(name=>String(name).startsWith(PWA_CACHE_PREFIX));
    const rows=await mapLimited(names,3,async name=>{
      const cache=await caches.open(name),requests=await cache.keys();
      const sizes=await mapLimited(requests,6,async req=>{try{const res=await cache.match(req),header=Number(res?.headers?.get?.('content-length'));return Number.isFinite(header)&&header>=0?header:(res?((await res.clone().arrayBuffer()).byteLength||0):0);}catch{return 0;}});
      return {name,entries:requests.length,bytes:sizes.reduce((a,b)=>a+b,0)};
    });
    for(const row of rows){result.entries+=row.entries;result.bytes+=row.bytes;result.caches.push(row);}
  } catch {}
  return result;
}
function emptyCityStorage(id,name=''){return {id,name,forecastBytes:0,forecastEntries:0,forecastModels:0,normalsBytes:0,normalsEntries:0,biasBytes:0,biasEntries:0,biasForecasts:0,biasObservations:0,evolutionBytes:0,evolutionEntries:0,evolutionSnapshots:0,marineBytes:0,marineEntries:0,healthBytes:0,healthEntries:0,healthSnapshots:0,totalBytes:0};}

export async function inspectLocalData(cities=[]) {
  const cityMap=new Map((cities||[]).map(city=>[String(city.id),emptyCityStorage(String(city.id),city.name||String(city.id))]));
  const category={
    favorites:{bytes:0,entries:0,items:(cities||[]).length},settings:{bytes:0,entries:0,items:0},forecasts:{bytes:0,entries:0,items:0},normals:{bytes:0,entries:0,items:0},bias:{bytes:0,entries:0,items:0},evolution:{bytes:0,entries:0,items:0},marine:{bytes:0,entries:0,items:0},health:{bytes:0,entries:0,items:0},other:{bytes:0,entries:0,items:0}
  };
  let localStorageBytes=0,localStorageEntries=0;
  try {
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key||!key.startsWith('meteocompare.web.'))continue;
      const rec=localStorageRecord(key);if(!rec)continue;localStorageBytes+=rec.bytes;localStorageEntries++;
      const addCity=(prefix,field,entryField,itemsField,items=0)=>{
        const id=key.slice(prefix.length);if(!cityMap.has(id))cityMap.set(id,emptyCityStorage(id,id));const row=cityMap.get(id);row[field]+=rec.bytes;row[entryField]++;if(itemsField)row[itemsField]+=items;row.totalBytes+=rec.bytes;
      };
      if(key===CITIES_KEY){category.favorites.bytes+=rec.bytes;category.favorites.entries++;}
      else if(key===SETTINGS_KEY){category.settings.bytes+=rec.bytes;category.settings.entries++;category.settings.items=rec.value&&typeof rec.value==='object'?Object.keys(rec.value).length:0;}
      else if(key===ANALYTICS_OPTOUT_KEY){category.settings.bytes+=rec.bytes;category.settings.entries++;category.settings.items++;}
      else if(key.startsWith(FORECAST_PREFIX)){const id=key.slice(FORECAST_PREFIX.length),models=Object.keys(rec.value?.seriesByModel||{}).length;category.forecasts.bytes+=rec.bytes;category.forecasts.entries++;category.forecasts.items+=models;addCity(FORECAST_PREFIX,'forecastBytes','forecastEntries','forecastModels',models);}
      else if(key.startsWith(NORMALS_PREFIX)){category.normals.bytes+=rec.bytes;category.normals.entries++;category.normals.items++;addCity(NORMALS_PREFIX,'normalsBytes','normalsEntries',null,0);}
      else if(key.startsWith(BIAS_PREFIX)){const forecasts=Array.isArray(rec.value?.forecasts)?rec.value.forecasts.length:0,observations=Array.isArray(rec.value?.observations)?rec.value.observations.length:0;category.bias.bytes+=rec.bytes;category.bias.entries++;category.bias.items+=forecasts+observations;addCity(BIAS_PREFIX,'biasBytes','biasEntries','biasForecasts',forecasts);const row=cityMap.get(key.slice(BIAS_PREFIX.length));row.biasObservations+=observations;}
      else if(key.startsWith(EVOLUTION_PREFIX)){const snapshots=Array.isArray(rec.value)?rec.value.length:0;category.evolution.bytes+=rec.bytes;category.evolution.entries++;category.evolution.items+=snapshots;addCity(EVOLUTION_PREFIX,'evolutionBytes','evolutionEntries','evolutionSnapshots',snapshots);}
      else if(key.startsWith(MARINE_PREFIX)){category.marine.bytes+=rec.bytes;category.marine.entries++;category.marine.items++;addCity(MARINE_PREFIX,'marineBytes','marineEntries',null,0);}
      else if(key.startsWith(HEALTH_PREFIX)){const snapshots=Array.isArray(rec.value)?rec.value.length:0;category.health.bytes+=rec.bytes;category.health.entries++;category.health.items+=snapshots;addCity(HEALTH_PREFIX,'healthBytes','healthEntries','healthSnapshots',snapshots);}
      else {category.other.bytes+=rec.bytes;category.other.entries++;}
    }
  } catch {}
  const idbEntries=await idbListEntries();let indexedDbBytes=0;
  for(const rec of idbEntries){
    indexedDbBytes+=rec.bytes;
    if(rec.key.startsWith(FORECAST_PREFIX)){const id=rec.key.slice(FORECAST_PREFIX.length),models=Object.keys(rec.value?.seriesByModel||{}).length;if(!cityMap.has(id))cityMap.set(id,emptyCityStorage(id,id));const row=cityMap.get(id);row.forecastBytes+=rec.bytes;row.forecastEntries++;row.forecastModels+=models;row.totalBytes+=rec.bytes;category.forecasts.bytes+=rec.bytes;category.forecasts.entries++;category.forecasts.items+=models;}
    else {category.other.bytes+=rec.bytes;category.other.entries++;}
  }
  const pwaCache=await cacheStorageStats();
  let origin={usage:null,quota:null,persisted:null};
  try { const est=await navigator.storage?.estimate?.();origin.usage=Number.isFinite(est?.usage)?est.usage:null;origin.quota=Number.isFinite(est?.quota)?est.quota:null; } catch {}
  try { const persisted=await navigator.storage?.persisted?.();origin.persisted=typeof persisted==='boolean'?persisted:null; } catch {}
  const appBytes=localStorageBytes+indexedDbBytes+pwaCache.bytes;
  const cityRows=[...cityMap.values()].map(row=>({...row,totalBytes:row.forecastBytes+row.normalsBytes+row.biasBytes+row.evolutionBytes+row.marineBytes+row.healthBytes,isFavorite:(cities||[]).some(c=>String(c.id)===row.id)})).sort((a,b)=>b.totalBytes-a.totalBytes);
  return {generatedAt:Date.now(),appBytes,localStorageBytes,localStorageEntries,indexedDbBytes,indexedDbEntries:idbEntries.length,pwaCacheBytes:pwaCache.bytes,pwaCacheEntries:pwaCache.entries,pwaCaches:pwaCache.caches,origin,categories:category,cities:cityRows};
}


export async function verifyLocalDataIntegrity(cities=[], {repair=false}={}) {
  const favoriteIds=new Set((cities||[]).map(c=>String(c.id))),issues=[],repairs=[];let checked=0,migrated=0,invalid=0,orphans=0,duplicates=0;
  const add=(code,detail={})=>issues.push({code,detail});
  const handleLocal=(key,parsed)=>{
    const ctx=recordContext(key);if(!ctx.kind)return;checked++;
    const mig=migrateRecord(ctx.kind,parsed,ctx),valid=mig.valid&&validatePayload(ctx.kind,mig.payload);
    if(!valid){invalid++;add('INVALID_RECORD',{key,kind:ctx.kind,error:mig.error||'INVALID_PAYLOAD'});if(repair){safeRemove(key);repairs.push({action:'REMOVE_INVALID',key});}return;}
    if(mig.migrated){migrated++;add('LEGACY_SCHEMA',{key,kind:ctx.kind,from:mig.fromVersion,to:DATA_SCHEMA_VERSION});if(repair&&writeLocalRecord(key,ctx.kind,mig.payload))repairs.push({action:'MIGRATE',key});}
    if(ctx.cityId&&!favoriteIds.has(String(ctx.cityId))){orphans++;add('ORPHAN_RECORD',{key,kind:ctx.kind,cityId:ctx.cityId});if(repair){safeRemove(key);repairs.push({action:'REMOVE_ORPHAN',key});}}
  };
  try{const keys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(Boolean);for(const key of keys){if(!key.startsWith('meteocompare.web.')||key===ANALYTICS_OPTOUT_KEY)continue;handleLocal(key,safeParse(localStorage.getItem(key),null));}}catch(err){add('LOCAL_STORAGE_SCAN_FAILED',{message:String(err?.message||err||'')});}
  const idbEntries=await idbListEntries();
  for(const rec of idbEntries){const key=rec.key,ctx=recordContext(key);if(!ctx.kind)continue;checked++;const mig=migrateRecord(ctx.kind,rec.raw,ctx),valid=mig.valid&&validatePayload(ctx.kind,mig.payload);
    if(!valid){invalid++;add('INVALID_RECORD',{key,kind:ctx.kind,store:'indexedDB',error:mig.error||'INVALID_PAYLOAD'});if(repair){await idbDelete(key);repairs.push({action:'REMOVE_INVALID',key,store:'indexedDB'});}continue;}
    if(mig.migrated){migrated++;add('LEGACY_SCHEMA',{key,kind:ctx.kind,store:'indexedDB',from:mig.fromVersion,to:DATA_SCHEMA_VERSION});if(repair&&await idbPut(key,mig.record))repairs.push({action:'MIGRATE',key,store:'indexedDB'});}
    if(ctx.cityId&&!favoriteIds.has(String(ctx.cityId))){orphans++;add('ORPHAN_RECORD',{key,kind:ctx.kind,cityId:ctx.cityId,store:'indexedDB'});if(repair){await idbDelete(key);repairs.push({action:'REMOVE_ORPHAN',key,store:'indexedDB'});}}
    if(ctx.kind==='forecast'){
      const legacyKey=FORECAST_PREFIX+ctx.cityId;try{if(localStorage.getItem(legacyKey)!=null){duplicates++;add('DUPLICATE_FORECAST',{key:legacyKey,cityId:ctx.cityId});if(repair){safeRemove(legacyKey);repairs.push({action:'REMOVE_DUPLICATE',key:legacyKey});}}}catch{}
    }
  }
  const runtime=getStorageIssues();for(const item of runtime)add(item.code,item.detail);
  return {checkedAt:Date.now(),schemaVersion:DATA_SCHEMA_VERSION,healthy:issues.length===0,repair,recordsChecked:checked,issueCount:issues.length,migrated,invalid,orphans,duplicates,issues,repairs};
}


function backupPayloadFor(prefix,cityId,kind,fallback=null){return readLocalRecord(prefix+cityId,kind,fallback);}
export async function createLocalBackup(cities=[], options={}) {
  const include={forecasts:Boolean(options.forecasts),normals:Boolean(options.normals),bias:Boolean(options.bias),evolution:Boolean(options.evolution),marine:Boolean(options.marine),health:Boolean(options.health)};
  const data={settings:loadSettings(),cities:loadCities(),forecasts:{},normals:{},bias:{},evolution:{},marine:{},health:{}};
  for(const city of cities||[]){const id=String(city.id);
    if(include.forecasts){const f=await loadForecastAsync(id);if(f)data.forecasts[id]=f;}
    if(include.normals){const v=loadNormals(id);if(v)data.normals[id]=v;}
    if(include.bias){const v=loadBias(id);if((v?.forecasts?.length||0)||(v?.observations?.length||0))data.bias[id]=v;}
    if(include.evolution){const v=loadEvolution(id);if(v?.length)data.evolution[id]=v;}
    if(include.marine){const v=loadMarine(id);if(v)data.marine[id]=v;}
    if(include.health){const v=loadModelHealth(id);if(v?.length)data.health[id]=v;}
  }
  let analyticsOptOut=false;try{analyticsOptOut=localStorage.getItem(ANALYTICS_OPTOUT_KEY)==='1';}catch{}
  return {type:'meteocompare-backup',formatVersion:BACKUP_FORMAT_VERSION,dataSchemaVersion:DATA_SCHEMA_VERSION,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),includes:include,privacy:{analyticsOptOut},data};
}
function validBackup(value){return Boolean(value&&value.type==='meteocompare-backup'&&Number(value.formatVersion)>=1&&Number(value.formatVersion)<=BACKUP_FORMAT_VERSION&&value.data&&typeof value.data==='object'&&Array.isArray(value.data.cities)&&value.data.settings&&typeof value.data.settings==='object');}
function cleanImportedSettings(settings){const out={};for(const key of Object.keys(defaultSettings))if(key in (settings||{}))out[key]=settings[key];return {...defaultSettings,...out,enabledModelIds:Array.isArray(out.enabledModelIds)&&out.enabledModelIds.length?out.enabledModelIds:DEFAULT_MODEL_IDS};}
export async function restoreLocalBackup(value,{replace=true}={}){
  if(!validBackup(value)){const err=new Error('INVALID_BACKUP');err.code='INVALID_BACKUP';throw err;}
  if(Number(value.dataSchemaVersion)>DATA_SCHEMA_VERSION){const err=new Error('BACKUP_FUTURE_SCHEMA');err.code='BACKUP_FUTURE_SCHEMA';throw err;}
  let currentAnalyticsOptOut=false;try{currentAnalyticsOptOut=localStorage.getItem(ANALYTICS_OPTOUT_KEY)==='1';}catch{}
  const backupAnalyticsOptOut=value?.privacy?.analyticsOptOut===true;
  if(replace)await clearAllData();
  // A restore must never silently relax a privacy choice: opt-out wins if set on either device/backup.
  if(currentAnalyticsOptOut||backupAnalyticsOptOut)try{localStorage.setItem(ANALYTICS_OPTOUT_KEY,'1');}catch{}
  const cities=value.data.cities.filter(x=>x&&x.id!=null&&Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))).map(x=>({...x,id:String(x.id)}));
  const settings=cleanImportedSettings(value.data.settings);saveSettings(settings);saveCities(cities);
  const ids=new Set(cities.map(c=>String(c.id))),writeMap=async(map,writer)=>{for(const [id,payload] of Object.entries(map||{}))if(ids.has(String(id))&&payload!=null)await writer(String(id),payload);};
  await writeMap(value.data.forecasts,saveForecast);await writeMap(value.data.normals,(id,v)=>saveNormals(id,v));await writeMap(value.data.bias,(id,v)=>saveBias(id,v));await writeMap(value.data.evolution,(id,v)=>saveEvolution(id,v));await writeMap(value.data.marine,(id,v)=>saveMarine(id,v));await writeMap(value.data.health,(id,v)=>saveModelHealth(id,v));
  return {cities:cities.length,settings:true,forecasts:Object.keys(value.data.forecasts||{}).length,normals:Object.keys(value.data.normals||{}).length,bias:Object.keys(value.data.bias||{}).length,evolution:Object.keys(value.data.evolution||{}).length,marine:Object.keys(value.data.marine||{}).length,health:Object.keys(value.data.health||{}).length};
}

export async function clearPwaRuntime() {
  let cachesDeleted=0,registrationsUnregistered=0;
  if(typeof caches!=='undefined'){
    try{
      const names=(await caches.keys()).filter(name=>String(name).startsWith(PWA_CACHE_PREFIX));
      const results=await Promise.all(names.map(name=>caches.delete(name).catch(()=>false)));
      cachesDeleted=results.filter(Boolean).length;
    }catch{}
  }
  try{
    if(typeof navigator!=='undefined'&&navigator.serviceWorker?.getRegistrations){
      const base=(typeof document!=='undefined'&&document.baseURI)||(typeof location!=='undefined'&&location.href)||null;
      const appScope=base?new URL('./',base).href:null;
      const registrations=await navigator.serviceWorker.getRegistrations();
      for(const registration of registrations){
        if(appScope&&registration?.scope!==appScope)continue;
        try{if(await registration.unregister())registrationsUnregistered++;}catch{}
      }
    }
  }catch{}
  return {cachesDeleted,registrationsUnregistered};
}

export async function clearAllData({includePwa=false}={}) {
  try { const keys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>k&&k.startsWith('meteocompare.web.'));keys.forEach(k=>safeRemove(k)); } catch {}
  if(typeof indexedDB!=='undefined'){
    try {
      const database=await db();
      database?.close?.();
      dbPromise=null;
      await new Promise(resolve=>{
        let req;
        try{req=indexedDB.deleteDatabase(DB_NAME);}catch{resolve();return;}
        req.onsuccess=req.onerror=req.onblocked=()=>resolve();
      });
    } catch {}
  }
  return includePwa?clearPwaRuntime():{cachesDeleted:0,registrationsUnregistered:0};
}
