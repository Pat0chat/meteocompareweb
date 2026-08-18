import { DEFAULT_MODEL_IDS } from './models.js';

const SETTINGS_KEY = 'meteocompare.web.settings.v1';
const CITIES_KEY = 'meteocompare.web.cities.v1';
const FORECAST_PREFIX = 'meteocompare.web.forecast.';
const EVOLUTION_PREFIX = 'meteocompare.web.evolution.';
const NORMALS_PREFIX = 'meteocompare.web.normals.era5-v1.';
const BIAS_PREFIX = 'meteocompare.web.bias.';
const DB_NAME = 'meteocompare.web.large-cache.v1';
const DB_STORE = 'cache';
const DB_VERSION = 1;

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
  collapsedSections: {},
};

function safeParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (err) { console.warn(`Stockage local indisponible pour ${key}:`, err); return false; }
}
function safeRemove(key) { try { localStorage.removeItem(key); } catch {} }

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    let req;
    try { req=indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
    req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>resolve(null);
    req.onblocked=()=>resolve(null);
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
  return new Promise(resolve=>{try{const tx=database.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}catch{resolve(false);}});
}
async function idbDelete(key){
  const database=await db(); if(!database)return false;
  return new Promise(resolve=>{try{const tx=database.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}catch{resolve(false);}});
}

export function loadSettings() {
  const parsed = safeParse(localStorage.getItem(SETTINGS_KEY), {});
  return { ...defaultSettings, ...parsed, enabledModelIds: Array.isArray(parsed.enabledModelIds) && parsed.enabledModelIds.length ? parsed.enabledModelIds : DEFAULT_MODEL_IDS };
}
export function saveSettings(settings) { safeSet(SETTINGS_KEY, settings); }
export function loadCities() { const v=safeParse(localStorage.getItem(CITIES_KEY), []); return Array.isArray(v)?v:[]; }
export function saveCities(cities) { safeSet(CITIES_KEY, cities); }

/* Forecast payloads are the largest records (17 models × hourly arrays).
   Keep legacy localStorage reads for migration, but persist new payloads in IndexedDB
   so several cities do not exhaust the small synchronous localStorage quota. */
export function loadForecast(cityId) { return safeParse(localStorage.getItem(FORECAST_PREFIX + cityId), null); }
export async function loadForecastAsync(cityId) {
  const key=FORECAST_PREFIX+cityId;
  const legacy=loadForecast(cityId);
  if(legacy){
    if(await idbPut(key,legacy))safeRemove(key);
    return legacy;
  }
  return idbGet(key);
}
export async function saveForecast(cityId, forecast) {
  const key=FORECAST_PREFIX+cityId;
  if(typeof indexedDB==='undefined'){safeSet(key,forecast);return;}
  const ok=await idbPut(key,forecast);
  if(ok)safeRemove(key);else safeSet(key,forecast);
}
export function deleteForecast(cityId) { const key=FORECAST_PREFIX+cityId; safeRemove(key); void idbDelete(key); }
export function deleteCityData(cityId) {
  safeRemove(EVOLUTION_PREFIX+cityId);
  safeRemove(NORMALS_PREFIX+cityId);
  safeRemove(BIAS_PREFIX+cityId);
  deleteForecast(cityId);
}

export function loadEvolution(cityId) { const v=safeParse(localStorage.getItem(EVOLUTION_PREFIX+cityId), []); return Array.isArray(v)?v:[]; }
export function saveEvolution(cityId, entries) { safeSet(EVOLUTION_PREFIX+cityId, entries); }

export function recordEvolutionSnapshot(cityId, forecast) {
  const now = Date.now();
  const previous = loadEvolution(cityId).filter(x => Number.isFinite(x.capturedAt) && now - x.capturedAt <= 5*24*3600e3);
  if (previous.some(x => Math.abs(now - x.capturedAt) < 3*3600e3)) return previous;
  const daily = {};
  for (const [modelId, series] of Object.entries(forecast.seriesByModel || {})) {
    series.daily.dates.forEach((date, i) => {
      daily[date] ||= {};
      daily[date][modelId] = {
        temperature: finiteOrNull(series.daily.tempMax[i]),
        precipitation: nonNegativeOrNull(series.daily.precipitationSum[i]),
        wind: nonNegativeOrNull(series.daily.windSpeedMax[i]),
      };
    });
  }
  const next = [...previous, { capturedAt: now, daily }].sort((a,b)=>a.capturedAt-b.capturedAt).slice(-40);
  saveEvolution(cityId, next);
  return next;
}

export function loadNormals(cityId) { return safeParse(localStorage.getItem(NORMALS_PREFIX+cityId), null); }
export function saveNormals(cityId, payload) { safeSet(NORMALS_PREFIX+cityId, payload); }
export function loadBias(cityId) { return safeParse(localStorage.getItem(BIAS_PREFIX+cityId), { forecasts:[], observations:[], updatedAt:null }); }
export function saveBias(cityId, data) { safeSet(BIAS_PREFIX+cityId, data); }

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
    return raw==null?null:{key,raw,bytes:textBytes(key)+textBytes(raw),value:safeParse(raw,null)};
  } catch { return null; }
}
async function idbListEntries() {
  const database=await db(); if(!database)return [];
  return new Promise(resolve=>{
    const out=[];
    try {
      const tx=database.transaction(DB_STORE,'readonly'),store=tx.objectStore(DB_STORE),req=store.openCursor();
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve(out);return;}out.push({key:String(cursor.key),value:cursor.value,bytes:textBytes(String(cursor.key))+serializedBytes(cursor.value)});cursor.continue();};
      req.onerror=()=>resolve(out);
    } catch { resolve(out); }
  });
}
async function cacheStorageStats(){
  if(typeof caches==='undefined')return {bytes:0,entries:0,caches:[]};
  const result={bytes:0,entries:0,caches:[]};
  try {
    for(const name of await caches.keys()){
      const cache=await caches.open(name),requests=await cache.keys();
      let cacheBytes=0;
      for(const req of requests){
        try {
          const res=await cache.match(req);
          const header=Number(res?.headers?.get?.('content-length'));
          const bytes=Number.isFinite(header)&&header>=0?header:(res?((await res.clone().arrayBuffer()).byteLength||0):0);
          cacheBytes+=bytes;
        } catch {}
      }
      result.entries+=requests.length;result.bytes+=cacheBytes;result.caches.push({name,entries:requests.length,bytes:cacheBytes});
    }
  } catch {}
  return result;
}
function emptyCityStorage(id,name=''){return {id,name,forecastBytes:0,forecastEntries:0,forecastModels:0,normalsBytes:0,normalsEntries:0,biasBytes:0,biasEntries:0,biasForecasts:0,biasObservations:0,evolutionBytes:0,evolutionEntries:0,evolutionSnapshots:0,totalBytes:0};}

export async function inspectLocalData(cities=[]) {
  const cityMap=new Map((cities||[]).map(city=>[String(city.id),emptyCityStorage(String(city.id),city.name||String(city.id))]));
  const category={
    favorites:{bytes:0,entries:0,items:(cities||[]).length},settings:{bytes:0,entries:0,items:0},forecasts:{bytes:0,entries:0,items:0},normals:{bytes:0,entries:0,items:0},bias:{bytes:0,entries:0,items:0},evolution:{bytes:0,entries:0,items:0},other:{bytes:0,entries:0,items:0}
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
      else if(key.startsWith(FORECAST_PREFIX)){const id=key.slice(FORECAST_PREFIX.length),models=Object.keys(rec.value?.seriesByModel||{}).length;category.forecasts.bytes+=rec.bytes;category.forecasts.entries++;category.forecasts.items+=models;addCity(FORECAST_PREFIX,'forecastBytes','forecastEntries','forecastModels',models);}
      else if(key.startsWith(NORMALS_PREFIX)){category.normals.bytes+=rec.bytes;category.normals.entries++;category.normals.items++;addCity(NORMALS_PREFIX,'normalsBytes','normalsEntries',null,0);}
      else if(key.startsWith(BIAS_PREFIX)){const forecasts=Array.isArray(rec.value?.forecasts)?rec.value.forecasts.length:0,observations=Array.isArray(rec.value?.observations)?rec.value.observations.length:0;category.bias.bytes+=rec.bytes;category.bias.entries++;category.bias.items+=forecasts+observations;addCity(BIAS_PREFIX,'biasBytes','biasEntries','biasForecasts',forecasts);const row=cityMap.get(key.slice(BIAS_PREFIX.length));row.biasObservations+=observations;}
      else if(key.startsWith(EVOLUTION_PREFIX)){const snapshots=Array.isArray(rec.value)?rec.value.length:0;category.evolution.bytes+=rec.bytes;category.evolution.entries++;category.evolution.items+=snapshots;addCity(EVOLUTION_PREFIX,'evolutionBytes','evolutionEntries','evolutionSnapshots',snapshots);}
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
  const cityRows=[...cityMap.values()].map(row=>({...row,totalBytes:row.forecastBytes+row.normalsBytes+row.biasBytes+row.evolutionBytes,isFavorite:(cities||[]).some(c=>String(c.id)===row.id)})).sort((a,b)=>b.totalBytes-a.totalBytes);
  return {generatedAt:Date.now(),appBytes,localStorageBytes,localStorageEntries,indexedDbBytes,indexedDbEntries:idbEntries.length,pwaCacheBytes:pwaCache.bytes,pwaCacheEntries:pwaCache.entries,pwaCaches:pwaCache.caches,origin,categories:category,cities:cityRows};
}

export async function clearAllData() {
  try { Object.keys(localStorage).filter(k=>k.startsWith('meteocompare.web.')).forEach(k=>safeRemove(k)); } catch {}
  if(typeof indexedDB==='undefined')return;
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
