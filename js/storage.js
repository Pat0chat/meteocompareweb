import { DEFAULT_MODEL_IDS } from './models.js';

const SETTINGS_KEY = 'meteocompare.web.settings.v1';
const CITIES_KEY = 'meteocompare.web.cities.v1';
const FORECAST_PREFIX = 'meteocompare.web.forecast.';
const EVOLUTION_PREFIX = 'meteocompare.web.evolution.';
const NORMALS_PREFIX = 'meteocompare.web.normals.era5-v1.';
const BIAS_PREFIX = 'meteocompare.web.bias.';

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

export function loadSettings() {
  const parsed = safeParse(localStorage.getItem(SETTINGS_KEY), {});
  return { ...defaultSettings, ...parsed, enabledModelIds: Array.isArray(parsed.enabledModelIds) && parsed.enabledModelIds.length ? parsed.enabledModelIds : DEFAULT_MODEL_IDS };
}
export function saveSettings(settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
export function loadCities() { const v=safeParse(localStorage.getItem(CITIES_KEY), []); return Array.isArray(v)?v:[]; }
export function saveCities(cities) { localStorage.setItem(CITIES_KEY, JSON.stringify(cities)); }

export function saveForecast(cityId, forecast) {
  localStorage.setItem(FORECAST_PREFIX + cityId, JSON.stringify(forecast));
}
export function loadForecast(cityId) { return safeParse(localStorage.getItem(FORECAST_PREFIX + cityId), null); }
export function deleteForecast(cityId) { localStorage.removeItem(FORECAST_PREFIX + cityId); }

export function loadEvolution(cityId) { const v=safeParse(localStorage.getItem(EVOLUTION_PREFIX+cityId), []); return Array.isArray(v)?v:[]; }
export function saveEvolution(cityId, entries) { localStorage.setItem(EVOLUTION_PREFIX+cityId, JSON.stringify(entries)); }

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
export function saveNormals(cityId, payload) { localStorage.setItem(NORMALS_PREFIX+cityId, JSON.stringify(payload)); }

export function loadBias(cityId) { return safeParse(localStorage.getItem(BIAS_PREFIX+cityId), { forecasts:[], observations:[], updatedAt:null }); }
export function saveBias(cityId, data) { localStorage.setItem(BIAS_PREFIX+cityId, JSON.stringify(data)); }

function finiteOrNull(v){ return Number.isFinite(v)?v:null; }
function nonNegativeOrNull(v){ return Number.isFinite(v)&&v>=0?v:null; }

export function clearAllData() {
  Object.keys(localStorage).filter(k=>k.startsWith('meteocompare.web.')).forEach(k=>localStorage.removeItem(k));
}
