import { selectedModels } from './models.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const PREVIOUS_RUNS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast';

const HOURLY_VARS = [
  'temperature_2m','precipitation','precipitation_probability','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high',
  'wind_speed_10m','wind_direction_10m','wind_gusts_10m','weather_code'
].join(',');
const DAILY_VARS = [
  'temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max',
  'wind_speed_10m_max','wind_gusts_10m_max','wind_direction_10m_dominant','weather_code','sunrise','sunset'
].join(',');

async function fetchJson(url, timeoutMs=30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers:{ 'Accept':'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(json.reason || 'Open-Meteo error');
    return json;
  } finally { clearTimeout(timer); }
}

export async function searchCities(query, language='fr') {
  const u = new URL(GEOCODING_URL);
  u.searchParams.set('name', query);
  u.searchParams.set('count','10');
  u.searchParams.set('language', language || 'fr');
  u.searchParams.set('format','json');
  const data = await fetchJson(u);
  return (data.results || []).map(r => ({
    id:String(r.id), name:r.name, admin1:r.admin1 || '', country:r.country || '', latitude:r.latitude, longitude:r.longitude,
    timezone:r.timezone || null,
  }));
}

export async function fetchForecast(city, enabledModelIds, requestedDays=7) {
  const models = selectedModels(enabledModelIds);
  if (!models.length) throw new Error('Aucun modèle météo activé.');
  const maxDays = Math.max(1, Math.min(Math.max(...models.map(m=>m.maxForecastDays)), requestedDays));
  const u = new URL(FORECAST_URL);
  u.searchParams.set('latitude', String(city.latitude));
  u.searchParams.set('longitude', String(city.longitude));
  u.searchParams.set('models', models.map(m=>m.apiKey).join(','));
  u.searchParams.set('hourly', HOURLY_VARS);
  u.searchParams.set('daily', DAILY_VARS);
  u.searchParams.set('timezone', city.timezone || 'auto');
  u.searchParams.set('forecast_days', String(maxDays));
  u.searchParams.set('wind_speed_unit','kmh');
  u.searchParams.set('temperature_unit','celsius');
  u.searchParams.set('precipitation_unit','mm');
  const raw = await fetchJson(u);
  return normalizeBatchedForecast(raw, city, models);
}

function values(raw, baseKey, model, single, allowShared=false) {
  const keys = [model.apiKey, ...model.aliases].map(k => `${baseKey}_${k}`);
  if (single || allowShared) keys.push(baseKey);
  for (const key of keys) if (Array.isArray(raw?.[key])) return raw[key];
  return null;
}
function numberList(v, predicate=Number.isFinite) { return Array.isArray(v) ? v.map(x => predicate(x) ? x : null) : null; }
function intList(v, predicate=Number.isFinite) { return Array.isArray(v) ? v.map(x => Number.isInteger(x) && predicate(x) ? x : null) : null; }
function strings(v) { return Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : null) : null; }
function alignIndices(indices, vals) { return indices.map(i=>vals?.[i] ?? null); }
function cloudCover(hourly, model, single) {
  const total = intList(values(hourly,'cloud_cover',model,single), x=>x>=0&&x<=100);
  if (total?.some(x=>x!==null)) return total;
  const layers = ['cloud_cover_low','cloud_cover_mid','cloud_cover_high'].map(k=>intList(values(hourly,k,model,single),x=>x>=0&&x<=100));
  const size = Math.max(0, ...layers.map(x=>x?.length||0));
  if (!size) return total;
  return Array.from({length:size},(_,i)=> {
    const ok=layers.map(a=>a?.[i]).filter(x=>Number.isInteger(x)&&x>=0&&x<=100);
    return ok.length ? Math.max(...ok) : null;
  });
}

export function normalizeBatchedForecast(raw, city, models) {
  const hourlyRaw = raw.hourly || {};
  const dailyRaw = raw.daily || {};
  const hourlySource = Array.isArray(hourlyRaw.time) ? hourlyRaw.time.map(x=>typeof x==='string'?x:'') : [];
  const dailySource = Array.isArray(dailyRaw.time) ? dailyRaw.time.map(x=>typeof x==='string'?x:'') : [];
  const hourlyIndices = hourlySource.map((x,i)=>x.trim()?i:-1).filter(i=>i>=0);
  const dailyIndices = dailySource.map((x,i)=>x.trim()?i:-1).filter(i=>i>=0);
  const hourlyTime = hourlyIndices.map(i=>hourlySource[i]);
  const dailyTime = dailyIndices.map(i=>dailySource[i]);
  const single = models.length===1;
  const seriesByModel = {};
  const errors = {};
  for (const model of models) {
    const tempH = numberList(values(hourlyRaw,'temperature_2m',model,single));
    const tempMax = numberList(values(dailyRaw,'temperature_2m_max',model,single));
    const tempMin = numberList(values(dailyRaw,'temperature_2m_min',model,single));
    const usable = (tempH||[]).some(Number.isFinite) || (tempMax||[]).some(Number.isFinite) || (tempMin||[]).some(Number.isFinite);
    if (!usable) { errors[model.id]='Indisponible ou hors zone'; continue; }
    seriesByModel[model.id] = {
      modelId:model.id,
      hourly:{
        timestamps:[...hourlyTime],
        temperature2m:alignIndices(hourlyIndices,tempH).map(x=>Number.isFinite(x)?x:null),
        precipitation:alignIndices(hourlyIndices,numberList(values(hourlyRaw,'precipitation',model,single),x=>Number.isFinite(x)&&x>=0)).map(x=>Number.isFinite(x)&&x>=0?x:null),
        precipitationProbability:alignIndices(hourlyIndices,intList(values(hourlyRaw,'precipitation_probability',model,single),x=>x>=0&&x<=100)),
        cloudCover:alignIndices(hourlyIndices,cloudCover(hourlyRaw,model,single)),
        windSpeed10m:alignIndices(hourlyIndices,numberList(values(hourlyRaw,'wind_speed_10m',model,single),x=>Number.isFinite(x)&&x>=0)),
        windDirection10m:alignIndices(hourlyIndices,intList(values(hourlyRaw,'wind_direction_10m',model,single),x=>x>=0&&x<=360)),
        windGusts10m:alignIndices(hourlyIndices,numberList(values(hourlyRaw,'wind_gusts_10m',model,single),x=>Number.isFinite(x)&&x>=0)),
        weatherCode:alignIndices(hourlyIndices,intList(values(hourlyRaw,'weather_code',model,single))),
      },
      daily:{
        dates:[...dailyTime],
        tempMax:alignIndices(dailyIndices,tempMax).map(x=>Number.isFinite(x)?x:null),
        tempMin:alignIndices(dailyIndices,tempMin).map(x=>Number.isFinite(x)?x:null),
        precipitationSum:alignIndices(dailyIndices,numberList(values(dailyRaw,'precipitation_sum',model,single),x=>Number.isFinite(x)&&x>=0)),
        precipitationProbabilityMax:alignIndices(dailyIndices,intList(values(dailyRaw,'precipitation_probability_max',model,single),x=>x>=0&&x<=100)),
        windSpeedMax:alignIndices(dailyIndices,numberList(values(dailyRaw,'wind_speed_10m_max',model,single),x=>Number.isFinite(x)&&x>=0)),
        windGustsMax:alignIndices(dailyIndices,numberList(values(dailyRaw,'wind_gusts_10m_max',model,single),x=>Number.isFinite(x)&&x>=0)),
        windDirection10mDominant:alignIndices(dailyIndices,intList(values(dailyRaw,'wind_direction_10m_dominant',model,single),x=>x>=0&&x<=360)),
        weatherCode:alignIndices(dailyIndices,intList(values(dailyRaw,'weather_code',model,single))),
        sunrise:alignIndices(dailyIndices,strings(values(dailyRaw,'sunrise',model,single,true))),
        sunset:alignIndices(dailyIndices,strings(values(dailyRaw,'sunset',model,single,true))),
      }
    };
  }
  if (!Object.keys(seriesByModel).length) throw new Error('Aucun modèle n’a renvoyé de données exploitables pour cette ville.');
  return { city:{...city, timezone: city.timezone || raw.timezone || 'UTC'}, timezone:raw.timezone || city.timezone || 'UTC', seriesByModel, errors, fetchedAt:new Date().toISOString() };
}

export async function fetchClimateNormals(city, startDate, endDate) {
  const u = new URL(ARCHIVE_URL);
  u.searchParams.set('latitude',String(city.latitude)); u.searchParams.set('longitude',String(city.longitude));
  u.searchParams.set('start_date',startDate); u.searchParams.set('end_date',endDate);
  u.searchParams.set('daily','temperature_2m_max,temperature_2m_min'); u.searchParams.set('timezone',city.timezone||'auto');
  u.searchParams.set('models','era5'); u.searchParams.set('temperature_unit','celsius');
  return fetchJson(u, 45000);
}

export async function fetchPreviousRuns(city, models, startDate, endDate) {
  const u = new URL(PREVIOUS_RUNS_URL);
  u.searchParams.set('latitude',String(city.latitude)); u.searchParams.set('longitude',String(city.longitude));
  u.searchParams.set('models',models.map(m=>m.apiKey).join(','));
  u.searchParams.set('hourly','temperature_2m_previous_day1,precipitation_previous_day1,wind_speed_10m_previous_day1');
  u.searchParams.set('timezone',city.timezone||'auto'); u.searchParams.set('start_date',startDate); u.searchParams.set('end_date',endDate);
  u.searchParams.set('wind_speed_unit','kmh'); u.searchParams.set('temperature_unit','celsius'); u.searchParams.set('precipitation_unit','mm');
  return fetchJson(u,45000);
}

export async function fetchBiasArchive(city, startDate, endDate) {
  const u = new URL(ARCHIVE_URL);
  u.searchParams.set('latitude',String(city.latitude)); u.searchParams.set('longitude',String(city.longitude));
  u.searchParams.set('start_date',startDate); u.searchParams.set('end_date',endDate);
  u.searchParams.set('daily','temperature_2m_max,precipitation_sum,wind_speed_10m_max');
  u.searchParams.set('timezone',city.timezone||'auto'); u.searchParams.set('wind_speed_unit','kmh'); u.searchParams.set('precipitation_unit','mm');
  return fetchJson(u,45000);
}
