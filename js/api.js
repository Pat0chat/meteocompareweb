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

async function fetchJson(url, timeoutMs=30000, externalSignal=null) {
  const controller = new AbortController();
  const abortFromExternal=()=>controller.abort();
  if(externalSignal?.aborted)controller.abort();
  else externalSignal?.addEventListener?.('abort',abortFromExternal,{once:true});
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers:{ 'Accept':'application/json' } });
    if (!res.ok) { const err=new Error(`HTTP ${res.status}`); err.code='HTTP_ERROR'; err.status=res.status; throw err; }
    const json = await res.json();
    if (json?.error) { const err=new Error(json.reason || 'Open-Meteo error'); err.code='OPEN_METEO_ERROR'; err.reason=json.reason||''; throw err; }
    return json;
  } finally { clearTimeout(timer); externalSignal?.removeEventListener?.('abort',abortFromExternal); }
}

export async function searchCities(query, language='fr', signal=null) {
  const u = new URL(GEOCODING_URL);
  u.searchParams.set('name', query);
  u.searchParams.set('count','10');
  u.searchParams.set('language', language || 'fr');
  u.searchParams.set('format','json');
  const data = await fetchJson(u,30000,signal);
  return (data.results || []).map(r => ({
    id:String(r.id), name:r.name, admin1:r.admin1 || '', country:r.country || '', latitude:r.latitude, longitude:r.longitude,
    timezone:r.timezone || null,
  }));
}

function forecastUrl(city, models, forecastDays, forecastHours, includeDaily=true) {
  const u = new URL(FORECAST_URL);
  u.searchParams.set('latitude', String(city.latitude));
  u.searchParams.set('longitude', String(city.longitude));
  u.searchParams.set('models', models.map(m=>m.apiKey).join(','));
  u.searchParams.set('hourly', HOURLY_VARS);
  if (includeDaily) u.searchParams.set('daily', DAILY_VARS);
  u.searchParams.set('timezone', city.timezone || 'auto');
  u.searchParams.set('forecast_days', String(Math.max(1, forecastDays)));
  // A rolling hourly window avoids losing most of short regional models late in
  // the civil day. Daily fields stay calendar based via forecast_days.
  u.searchParams.set('forecast_hours', String(Math.max(1, forecastHours)));
  u.searchParams.set('wind_speed_unit','kmh');
  u.searchParams.set('temperature_unit','celsius');
  u.searchParams.set('precipitation_unit','mm');
  return u;
}

function modelRecoveryHours(model, requestedHours) {
  return Math.max(1, Math.min(requestedHours, model.recoveryRequestHours || model.horizonHours || model.maxForecastDays*24));
}

export function hourlySeriesHealth(series, model, requestedHours) {
  const hourly=series?.hourly||{}, expected=Math.max(1,Math.min(Number(requestedHours)||hourly.timestamps?.length||1,model.horizonHours||requestedHours||1));
  const count=a=>Array.isArray(a)?a.filter(Number.isFinite).length:0;
  const counts={temperature:count(hourly.temperature2m),precipitation:count(hourly.precipitation),wind:count(hourly.windSpeed10m)};
  const criticalMin=Math.min(counts.temperature,counts.precipitation,counts.wind),criticalTotal=counts.temperature+counts.precipitation+counts.wind;
  // This guard is deliberately tolerant: it detects severe truncation or a
  // missing critical variable, not a few unavailable boundary hours.
  const minimum=Math.min(expected,Math.max(8,Math.floor(expected*.55)));
  return {expected,minimum,counts,criticalMin,criticalTotal,ratio:Math.min(1,criticalMin/expected),degraded:criticalMin<minimum,score:criticalMin*1000+criticalTotal};
}

function hasFullCivilDayAxis(timestamps,date){
  const day=(timestamps||[]).filter(ts=>typeof ts==='string'&&ts.slice(0,10)===date);
  if(day.length<23||day.length>25)return false;
  return day.some(ts=>ts.slice(11,16)==='00:00')&&day.some(ts=>ts.slice(11,16)==='23:00');
}

export function sanitizeIncompleteFutureDaily(series) {
  const h=series?.hourly,d=series?.daily;if(!h?.timestamps?.length||!d?.dates?.length)return series;
  // Today is intentionally left untouched: the rolling hourly window starts at
  // the current hour while provider daily aggregates still describe the whole
  // civil day. For future days, invalidate each daily metric family only when
  // its critical hourly footprint is incomplete. This prevents (for example) a
  // truncated precipitation series from contaminating daily rain agreement even
  // if temperature happened to be complete.
  for(let di=1;di<d.dates.length;di++){
    const date=d.dates[di];if(!hasFullCivilDayAxis(h.timestamps,date))continue;
    const indices=[];for(let i=0;i<h.timestamps.length;i++)if(h.timestamps[i]?.slice(0,10)===date)indices.push(i);
    const complete=a=>indices.length>=23&&indices.length<=25&&indices.every(i=>Number.isFinite(a?.[i]));
    const tempComplete=complete(h.temperature2m),precipComplete=complete(h.precipitation),windComplete=complete(h.windSpeed10m),weatherComplete=complete(h.weatherCode);
    if(!tempComplete)for(const key of ['tempMax','tempMin'])if(Array.isArray(d[key]))d[key][di]=null;
    if(!precipComplete)for(const key of ['precipitationSum','precipitationProbabilityMax'])if(Array.isArray(d[key]))d[key][di]=null;
    if(!windComplete)for(const key of ['windSpeedMax','windGustsMax','windDirection10mDominant'])if(Array.isArray(d[key]))d[key][di]=null;
    if(!weatherComplete&&Array.isArray(d.weatherCode))d.weatherCode[di]=null;
  }
  return series;
}

async function fetchModelGroup(city, models, forecastDays, forecastHours) {
  const raw=await fetchJson(forecastUrl(city,models,forecastDays,forecastHours,true));
  return normalizeBatchedForecast(raw,city,models,forecastHours);
}

export async function fetchForecast(city, enabledModelIds, requestedDays=7) {
  const models = selectedModels(enabledModelIds);
  if (!models.length) { const err=new Error('NO_MODELS_ENABLED'); err.code='NO_MODELS_ENABLED'; throw err; }
  const maxDays = Math.max(1, Math.min(Math.max(...models.map(m=>m.maxForecastDays)), requestedDays));
  const requestHours=maxDays*24;
  const normalized=await fetchModelGroup(city,models,maxDays,requestHours);

  // Multi-model payloads can occasionally contain a severely truncated series
  // for an otherwise available model. Detect this generically for every model
  // using temperature + precipitation + wind, then retry only the suspicious
  // cohort in one smaller request. Missing regional models are *not* retried:
  // they are normally outside their geographic domain.
  const suspicious=models.filter(m=>normalized.seriesByModel[m.id]&&normalized.modelMeta[m.id]?.hourlyHealth?.degraded);
  if(suspicious.length){
    const recoveryHours=Math.max(...suspicious.map(m=>modelRecoveryHours(m,requestHours)));
    const recoveryDays=Math.max(1,Math.min(requestedDays,Math.max(...suspicious.map(m=>m.maxForecastDays)),Math.ceil(recoveryHours/24)));
    try{
      const recovery=await fetchModelGroup(city,suspicious,recoveryDays,recoveryHours);
      for(const model of suspicious){
        const id=model.id,beforeMeta=normalized.modelMeta[id],afterMeta=recovery.modelMeta[id],before=beforeMeta?.hourlyHealth,after=afterMeta?.hourlyHealth;
        if(beforeMeta)beforeMeta.recoveryAttempted=true;
        if(recovery.seriesByModel[id]&&after&&(!before||after.score>before.score)){
          const replacement=recovery.seriesByModel[id],current=normalized.seriesByModel[id];
          normalized.seriesByModel[id]={...replacement,daily:replacement?.daily?.dates?.length?replacement.daily:current.daily};
          normalized.modelMeta[id]={...afterMeta,recoveryAttempted:true,recoveredFromBatch:true,healthBefore:before||null};
        }
      }
    }catch{
      for(const model of suspicious)if(normalized.modelMeta[model.id])normalized.modelMeta[model.id].recoveryAttempted=true;
      // Recovery is best-effort; keep the usable portion of the original batch.
    }
  }
  for(const model of models){
    const meta=normalized.modelMeta[model.id];if(!meta)continue;
    const health=hourlySeriesHealth(normalized.seriesByModel[model.id],model,requestHours);meta.hourlyHealth=health;
    if(health.degraded)meta.dataWarning='PARTIAL_HOURLY_SERIES';else delete meta.dataWarning;
  }
  return normalized;
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


function parseIsoCandidate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function modelRunTimestamp(raw, model) {
  const keys = [model.apiKey, ...model.aliases];
  const direct=[];
  for (const key of keys) direct.push(
    raw?.[`${key}_run_time`], raw?.[`${key}_run`], raw?.[`${key}_initialization_time`], raw?.[`${key}_initialization`],
    raw?.model_metadata?.[key]?.run_time, raw?.model_metadata?.[key]?.initialization_time, raw?.models?.[key]?.run_time, raw?.models?.[key]?.initialization_time
  );
  for (const value of direct) { const parsed=parseIsoCandidate(value); if(parsed)return parsed; }
  return null;
}
function seriesCoverage(series) {
  const hourly=series?.hourly, values=[];
  if(!hourly?.timestamps?.length)return { firstTimestamp:null, lastTimestamp:null };
  for(let i=0;i<hourly.timestamps.length;i++){
    const usable=[hourly.temperature2m?.[i],hourly.precipitation?.[i],hourly.windSpeed10m?.[i],hourly.weatherCode?.[i]].some(v=>Number.isFinite(v));
    if(usable)values.push(hourly.timestamps[i]);
  }
  return { firstTimestamp:values[0]||null, lastTimestamp:values.at(-1)||null };
}

export function normalizeBatchedForecast(raw, city, models, requestedHours=null) {
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
  const modelMeta = {};
  const errors = {};
  for (const model of models) {
    const tempH = numberList(values(hourlyRaw,'temperature_2m',model,single));
    const tempMax = numberList(values(dailyRaw,'temperature_2m_max',model,single));
    const tempMin = numberList(values(dailyRaw,'temperature_2m_min',model,single));
    const usable = (tempH||[]).some(Number.isFinite) || (tempMax||[]).some(Number.isFinite) || (tempMin||[]).some(Number.isFinite);
    if (!usable) { errors[model.id]='MODEL_UNAVAILABLE'; continue; }
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
    sanitizeIncompleteFutureDaily(seriesByModel[model.id]);
    const coverage=seriesCoverage(seriesByModel[model.id]),health=hourlySeriesHealth(seriesByModel[model.id],model,requestedHours||hourlyTime.length);
    modelMeta[model.id]={ runTimestamp:modelRunTimestamp(raw,model), ...coverage, hourlyHealth:health, nativeStepMinutes:model.nativeStepMinutes||60, updateMinutes:model.updateMinutes||null };
  }
  if (!Object.keys(seriesByModel).length) { const err=new Error('NO_USABLE_MODELS'); err.code='NO_USABLE_MODELS'; throw err; }
  const fetchedAt=new Date().toISOString();
  for(const meta of Object.values(modelMeta))meta.loadedAt=fetchedAt;
  const resolvedTimezone=raw.timezone || city.timezone || 'UTC';
  return { city:{...city, timezone:resolvedTimezone}, timezone:resolvedTimezone, seriesByModel, modelMeta, errors, requestedModelIds:models.map(m=>m.id), fetchedAt };
}

export async function fetchClimateNormals(city, startDate, endDate) {
  const u = new URL(ARCHIVE_URL);
  u.searchParams.set('latitude',String(city.latitude)); u.searchParams.set('longitude',String(city.longitude));
  u.searchParams.set('start_date',startDate); u.searchParams.set('end_date',endDate);
  u.searchParams.set('daily','temperature_2m_max,temperature_2m_min'); u.searchParams.set('timezone',city.timezone||'auto');
  u.searchParams.set('models','era5'); u.searchParams.set('temperature_unit','celsius');
  return fetchJson(u, 45000);
}

function previousRunSeries(hourly,base,model,single){
  const lead=`${base}_previous_day1`,keys=[];
  for(const key of [model.apiKey,...model.aliases])keys.push(`${lead}_${key}`,`${base}_${key}_previous_day1`);
  if(single)keys.push(lead);
  for(const key of keys)if(Array.isArray(hourly?.[key]))return hourly[key];
  return null;
}
function previousRunHealth(raw,model,single){
  const h=raw?.hourly||{},expected=Array.isArray(h.time)?h.time.filter(x=>typeof x==='string'&&x).length:0,count=a=>Array.isArray(a)?a.filter(Number.isFinite).length:0;
  const counts={temperature:count(previousRunSeries(h,'temperature_2m',model,single)),precipitation:count(previousRunSeries(h,'precipitation',model,single)),wind:count(previousRunSeries(h,'wind_speed_10m',model,single))};
  const criticalMin=Math.min(counts.temperature,counts.precipitation,counts.wind),minimum=expected?Math.min(expected,Math.max(8,Math.floor(expected*.55))):0;
  return {expected,minimum,counts,criticalMin,degraded:expected>0&&criticalMin<minimum,hasAny:Object.values(counts).some(Boolean)};
}
function previousRunsUrl(city,models,startDate,endDate){
  const u = new URL(PREVIOUS_RUNS_URL);
  u.searchParams.set('latitude',String(city.latitude)); u.searchParams.set('longitude',String(city.longitude));
  u.searchParams.set('models',models.map(m=>m.apiKey).join(','));
  u.searchParams.set('hourly','temperature_2m_previous_day1,precipitation_previous_day1,wind_speed_10m_previous_day1');
  u.searchParams.set('timezone',city.timezone||'auto'); u.searchParams.set('start_date',startDate); u.searchParams.set('end_date',endDate);
  u.searchParams.set('wind_speed_unit','kmh'); u.searchParams.set('temperature_unit','celsius'); u.searchParams.set('precipitation_unit','mm');
  return u;
}
function mergePreviousRunModel(target,recovery,model,recoverySingle){
  const th=target.hourly||{},rh=recovery.hourly||{},targetTimes=Array.isArray(th.time)?th.time:[],recoveryTimes=Array.isArray(rh.time)?rh.time:[],index=new Map(recoveryTimes.map((x,i)=>[x,i]));
  for(const base of ['temperature_2m','precipitation','wind_speed_10m']){
    const src=previousRunSeries(rh,base,model,recoverySingle);if(!src)continue;
    const aligned=targetTimes.map(ts=>{const i=index.get(ts);return i==null?null:(src[i]??null);});
    th[`${base}_previous_day1_${model.apiKey}`]=aligned;
  }
  target.hourly=th;return target;
}

export async function fetchPreviousRuns(city, models, startDate, endDate) {
  const raw=await fetchJson(previousRunsUrl(city,models,startDate,endDate),45000),single=models.length===1;
  const suspicious=models.filter(m=>{const h=previousRunHealth(raw,m,single);return h.hasAny&&h.degraded;});
  if(!suspicious.length)return raw;
  try{
    const recovery=await fetchJson(previousRunsUrl(city,suspicious,startDate,endDate),45000),recoverySingle=suspicious.length===1;
    for(const model of suspicious){
      const before=previousRunHealth(raw,model,single),after=previousRunHealth(recovery,model,recoverySingle);
      if(after.criticalMin>before.criticalMin)mergePreviousRunModel(raw,recovery,model,recoverySingle);
    }
  }catch{/* Historical recovery is best-effort; incomplete civil days are rejected downstream. */}
  return raw;
}

export async function fetchBiasArchive(city, startDate, endDate) {
  const u = new URL(ARCHIVE_URL);
  u.searchParams.set('latitude',String(city.latitude)); u.searchParams.set('longitude',String(city.longitude));
  u.searchParams.set('start_date',startDate); u.searchParams.set('end_date',endDate);
  u.searchParams.set('daily','temperature_2m_max,precipitation_sum,wind_speed_10m_max');
  u.searchParams.set('timezone',city.timezone||'auto'); u.searchParams.set('wind_speed_unit','kmh'); u.searchParams.set('precipitation_unit','mm');
  return fetchJson(u,45000);
}
