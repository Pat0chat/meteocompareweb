import { selectedModels } from './models.js';
import { normalizeBatchedForecast, hourlySeriesHealth } from './data/forecast-normalizer.js';
import { normalizeCity, normalizeForecastPayload } from './data/contracts.js';
export { normalizeBatchedForecast, hourlySeriesHealth, sanitizeIncompleteFutureDaily } from './data/forecast-normalizer.js';
import { fetchOpenMeteoJson } from './api-budget.js';

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

async function fetchJson(url, timeoutMs=30000, externalSignal=null, category='other', cacheTtlMs=0) {
  return fetchOpenMeteoJson(url,{timeoutMs,signal:externalSignal,category,cacheTtlMs,dedupe:!externalSignal});
}
function requireCity(city){const latitude=Number(city?.latitude),longitude=Number(city?.longitude);if(Number.isFinite(latitude)&&latitude>=-90&&latitude<=90&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180)return {...city,latitude,longitude};const err=new Error('INVALID_CITY');err.code='INVALID_CITY';throw err;}


export async function searchCities(query, language='fr', signal=null) {
  const u = new URL(GEOCODING_URL);
  u.searchParams.set('name', query);
  u.searchParams.set('count','10');
  u.searchParams.set('language', language || 'fr');
  u.searchParams.set('format','json');
  const data = await fetchJson(u,30000,signal,'geocoding',5*60_000);
  return (data.results || []).map(r => normalizeCity({
    id:String(r.id), name:r.name, admin1:r.admin1 || '', country:r.country || '', latitude:r.latitude, longitude:r.longitude,
    timezone:r.timezone || null,
  })).filter(Boolean);
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

async function fetchModelGroup(city, models, forecastDays, forecastHours) {
  const raw=await fetchJson(forecastUrl(city,models,forecastDays,forecastHours,true),30000,null,'forecast');
  return normalizeBatchedForecast(raw,city,models,forecastHours);
}
function isModelSelectionFailure(error){return error?.code==='OPEN_METEO_ERROR'||(error?.code==='HTTP_ERROR'&&Number(error.status)>=400&&Number(error.status)<500&&![408,429].includes(Number(error.status)));}
function modelRequestError(error){return error?.code==='HTTP_ERROR'?`HTTP_${error.status||'ERROR'}`:(error?.code||'MODEL_UNAVAILABLE');}
async function isolateRejectedModelGroup(city,models,forecastDays,forecastHours,error){
  if(models.length===1)return {parts:[],errors:{[models[0].id]:modelRequestError(error)}};
  const middle=Math.ceil(models.length/2),left=models.slice(0,middle),right=models.slice(middle);
  const [a,b]=await Promise.all([fetchModelGroupResilient(city,left,forecastDays,forecastHours),fetchModelGroupResilient(city,right,forecastDays,forecastHours)]);
  return {parts:[...a.parts,...b.parts],errors:{...a.errors,...b.errors}};
}
async function fetchModelGroupResilient(city,models,forecastDays,forecastHours){
  try{return {parts:[await fetchModelGroup(city,models,forecastDays,forecastHours)],errors:{}};}
  catch(error){if(!isModelSelectionFailure(error))throw error;return isolateRejectedModelGroup(city,models,forecastDays,forecastHours,error);}
}
function mergeForecastParts(city,models,parts,isolatedErrors={}){
  if(!parts.length){const error=new Error('NO_USABLE_MODELS');error.code='NO_USABLE_MODELS';throw error;}
  const seriesByModel={},modelMeta={},errors={...isolatedErrors};let fetchedAt=0,timezone=city.timezone||'UTC',resolvedCity=city;
  for(const part of parts){Object.assign(seriesByModel,part.seriesByModel||{});Object.assign(modelMeta,part.modelMeta||{});Object.assign(errors,part.errors||{});const stamp=Date.parse(part.fetchedAt||'');if(Number.isFinite(stamp))fetchedAt=Math.max(fetchedAt,stamp);if(part.timezone)timezone=part.timezone;if(part.city)resolvedCity=part.city;}
  const merged={city:{...resolvedCity,timezone:resolvedCity?.timezone||timezone},timezone,seriesByModel,modelMeta,errors,requestedModelIds:models.map(model=>model.id),fetchedAt:new Date(fetchedAt||Date.now()).toISOString()};
  const normalized=normalizeForecastPayload(merged,{cityId:city.id});if(!normalized){const error=new Error('NORMALIZED_FORECAST_CONTRACT_FAILED');error.code='NORMALIZED_FORECAST_CONTRACT_FAILED';throw error;}return normalized;
}

export async function fetchForecast(city, enabledModelIds, requestedDays=7) {
  city=requireCity(city);city=normalizeCity(city);if(!city){const err=new Error('INVALID_CITY');err.code='INVALID_CITY';throw err;}
  const models = selectedModels(enabledModelIds);
  if (!models.length) { const err=new Error('NO_MODELS_ENABLED'); err.code='NO_MODELS_ENABLED'; throw err; }
  const maxDays = Math.max(1, Math.min(Math.max(...models.map(m=>m.maxForecastDays)), requestedDays));
  const requestHours=maxDays*24;
  let normalized;
  try{normalized=await fetchModelGroup(city,models,maxDays,requestHours);}
  catch(error){if(!isModelSelectionFailure(error))throw error;const fallback=await isolateRejectedModelGroup(city,models,maxDays,requestHours,error);normalized=mergeForecastParts(city,models,fallback.parts,fallback.errors);}

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

export async function fetchClimateNormals(city, startDate, endDate) {
  city=requireCity(city);
  const u = new URL(ARCHIVE_URL);
  u.searchParams.set('latitude',String(city.latitude)); u.searchParams.set('longitude',String(city.longitude));
  u.searchParams.set('start_date',startDate); u.searchParams.set('end_date',endDate);
  u.searchParams.set('daily','temperature_2m_max,temperature_2m_min'); u.searchParams.set('timezone',city.timezone||'auto');
  u.searchParams.set('models','era5'); u.searchParams.set('temperature_unit','celsius');
  return fetchJson(u,45000,null,'archive');
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
  city=requireCity(city);
  const raw=await fetchJson(previousRunsUrl(city,models,startDate,endDate),45000,null,'previous-runs'),single=models.length===1;
  const suspicious=models.filter(m=>{const h=previousRunHealth(raw,m,single);return h.hasAny&&h.degraded;});
  if(!suspicious.length)return raw;
  try{
    const recovery=await fetchJson(previousRunsUrl(city,suspicious,startDate,endDate),45000,null,'previous-runs'),recoverySingle=suspicious.length===1;
    for(const model of suspicious){
      const before=previousRunHealth(raw,model,single),after=previousRunHealth(recovery,model,recoverySingle);
      if(after.criticalMin>before.criticalMin)mergePreviousRunModel(raw,recovery,model,recoverySingle);
    }
  }catch{/* Historical recovery is best-effort; incomplete civil days are rejected downstream. */}
  return raw;
}

export async function fetchBiasArchive(city, startDate, endDate) {
  city=requireCity(city);
  const u = new URL(ARCHIVE_URL);
  u.searchParams.set('latitude',String(city.latitude)); u.searchParams.set('longitude',String(city.longitude));
  u.searchParams.set('start_date',startDate); u.searchParams.set('end_date',endDate);
  u.searchParams.set('daily','temperature_2m_max,precipitation_sum,wind_speed_10m_max');
  // Use one stable reanalysis reference for local forecast skill. The archive API's
  // default may otherwise switch to recent IFS data, which is not independent of ECMWF forecasts.
  u.searchParams.set('models','era5');
  u.searchParams.set('timezone',city.timezone||'auto'); u.searchParams.set('temperature_unit','celsius'); u.searchParams.set('wind_speed_unit','kmh'); u.searchParams.set('precipitation_unit','mm');
  return fetchJson(u,45000,null,'archive');
}
