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
