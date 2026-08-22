import { DEFAULT_MODEL_IDS, REFRESH_INTERVALS, WEATHER_MODELS } from '../models.js';
import { DEFAULT_FORECAST_ENGINE, FORECAST_ENGINES } from '../forecast-engines.js';

const KNOWN_MODEL_IDS = new Set(WEATHER_MODELS.map(model => model.id));
const REFRESH_IDS = new Set(REFRESH_INTERVALS.map(row => row.id));
const THEMES = new Set(['SYSTEM','LIGHT','DARK']);
const LANGUAGES = new Set(['SYSTEM','FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']);
const MODEL_SORTS = new Set(['ZONE','FAMILLE','FINESSE']);
const DETAIL_MODES = new Set(['DAILY','HOURLY']);
const DETAIL_TABS = new Set(['CONDITIONS','TEMPERATURE','PRECIPITATION','WIND']);
const CONFIDENCE_METRICS = new Set(['TEMPERATURE','PRECIPITATION','WIND']);
const TIMELINE_MODES = new Set(['HOURLY','DAILY']);
const DENSITIES = new Set(['COMFORTABLE','COMPACT']);
const CHART_HORIZONS = new Set([24,72,168]);
const FORECAST_ENGINE_IDS = new Set(FORECAST_ENGINES);

export const DEFAULT_SETTINGS = Object.freeze({
  enabledModelIds: Object.freeze([...DEFAULT_MODEL_IDS]),
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
  forecastEngine: DEFAULT_FORECAST_ENGINE,
  collapsedSections: Object.freeze({}),
});

function enumValue(value, allowed, fallback){ return allowed.has(value) ? value : fallback; }
function finiteCoordinate(value,min,max){ const n=Number(value); return Number.isFinite(n)&&n>=min&&n<=max?n:null; }
function validTimezone(value){
  if(typeof value!=='string'||!value.trim())return null;
  const tz=value.trim();
  try{ new Intl.DateTimeFormat('en',{timeZone:tz}).format(); return tz; }catch{return null;}
}
function safeObject(value){ return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; }

export function normalizeModelIds(ids,{fallback=true}={}){
  const unique=[];
  for(const id of Array.isArray(ids)?ids:[]){
    const key=String(id||'');
    if(KNOWN_MODEL_IDS.has(key)&&!unique.includes(key))unique.push(key);
  }
  return unique.length||!fallback?unique:[...DEFAULT_MODEL_IDS];
}

export function normalizeSettings(value={}){
  const source=safeObject(value),collapsed=safeObject(source.collapsedSections),chartHorizon=Number(source.chartHorizon);
  return {
    enabledModelIds: normalizeModelIds(source.enabledModelIds),
    theme: enumValue(source.theme,THEMES,DEFAULT_SETTINGS.theme),
    language: enumValue(source.language,LANGUAGES,DEFAULT_SETTINGS.language),
    refreshInterval: enumValue(source.refreshInterval,REFRESH_IDS,DEFAULT_SETTINGS.refreshInterval),
    modelSort: enumValue(source.modelSort,MODEL_SORTS,DEFAULT_SETTINGS.modelSort),
    detailViewMode: enumValue(source.detailViewMode,DETAIL_MODES,DEFAULT_SETTINGS.detailViewMode),
    detailTab: enumValue(source.detailTab,DETAIL_TABS,DEFAULT_SETTINGS.detailTab),
    confidenceMetric: enumValue(source.confidenceMetric,CONFIDENCE_METRICS,DEFAULT_SETTINGS.confidenceMetric),
    chartHorizon: CHART_HORIZONS.has(chartHorizon)?chartHorizon:DEFAULT_SETTINGS.chartHorizon,
    timelineMode: enumValue(source.timelineMode,TIMELINE_MODES,DEFAULT_SETTINGS.timelineMode),
    density: enumValue(source.density,DENSITIES,DEFAULT_SETTINGS.density),
    localWeightedConsensus: source.localWeightedConsensus===true,
    forecastEngine: enumValue(source.forecastEngine,FORECAST_ENGINE_IDS,DEFAULT_SETTINGS.forecastEngine),
    collapsedSections: Object.fromEntries(Object.entries(collapsed).filter(([key,val])=>typeof key==='string'&&key.length<=160&&typeof val==='boolean')),
  };
}

export function normalizeCity(value){
  if(!value||typeof value!=='object')return null;
  const id=value.id==null?'':String(value.id).trim(),latitude=finiteCoordinate(value.latitude,-90,90),longitude=finiteCoordinate(value.longitude,-180,180);
  if(!id||latitude==null||longitude==null)return null;
  return {
    ...value,
    id,
    name: typeof value.name==='string'&&value.name.trim()?value.name.trim():id,
    admin1: typeof value.admin1==='string'?value.admin1:'',
    country: typeof value.country==='string'?value.country:'',
    latitude,
    longitude,
    timezone: validTimezone(value.timezone),
    marineEnabled: value.marineEnabled===true,
  };
}

export function normalizeCities(values){
  const rows=[],seen=new Set();
  for(const value of Array.isArray(values)?values:[]){
    const city=normalizeCity(value);if(!city||seen.has(city.id))continue;
    seen.add(city.id);rows.push(city);
  }
  return rows;
}

const HOURLY_KEYS = ['temperature2m','precipitation','precipitationProbability','cloudCover','windSpeed10m','windDirection10m','windGusts10m','weatherCode'];
const DAILY_KEYS = ['tempMax','tempMin','precipitationSum','precipitationProbabilityMax','windSpeedMax','windGustsMax','windDirection10mDominant','weatherCode','sunrise','sunset'];

function arrayAligned(value,length){ return Array.isArray(value)&&value.length===length; }
function arrayValuesValid(value,predicate){if(!Array.isArray(value))return false;for(let i=0;i<value.length;i++){const item=value[i];if(item!==null&&!predicate(item))return false;}return true;}
const finiteNumber=value=>Number.isFinite(value);
const nonNegative=value=>Number.isFinite(value)&&value>=0;
const integer=value=>Number.isInteger(value);
const percent=value=>Number.isInteger(value)&&value>=0&&value<=100;
const direction=value=>Number.isInteger(value)&&value>=0&&value<=360;
const textValue=value=>typeof value==='string';
function timestampsValid(values){ return Array.isArray(values)&&values.every(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)); }
function datesValid(values){ return Array.isArray(values)&&values.every(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)); }

export function forecastSeriesIssues(series){
  const issues=[];
  if(!series||typeof series!=='object')return ['SERIES_NOT_OBJECT'];
  const hourly=series.hourly,daily=series.daily;
  if(!hourly||typeof hourly!=='object')issues.push('HOURLY_MISSING');
  if(!daily||typeof daily!=='object')issues.push('DAILY_MISSING');
  if(issues.length)return issues;
  const hourlyLength=Array.isArray(hourly.timestamps)?hourly.timestamps.length:-1,dailyLength=Array.isArray(daily.dates)?daily.dates.length:-1;
  if(hourlyLength<1||!timestampsValid(hourly.timestamps))issues.push('HOURLY_AXIS_INVALID');
  if(dailyLength<0||!datesValid(daily.dates))issues.push('DAILY_AXIS_INVALID');
  if(hourlyLength>=0){
    for(const key of HOURLY_KEYS)if(!arrayAligned(hourly[key],hourlyLength))issues.push(`HOURLY_${key}_MISALIGNED`);
    if(arrayAligned(hourly.temperature2m,hourlyLength)&&!arrayValuesValid(hourly.temperature2m,finiteNumber))issues.push('HOURLY_temperature2m_INVALID');
    for(const key of ['precipitation','windSpeed10m','windGusts10m'])if(arrayAligned(hourly[key],hourlyLength)&&!arrayValuesValid(hourly[key],nonNegative))issues.push(`HOURLY_${key}_INVALID`);
    for(const key of ['precipitationProbability','cloudCover'])if(arrayAligned(hourly[key],hourlyLength)&&!arrayValuesValid(hourly[key],percent))issues.push(`HOURLY_${key}_INVALID`);
    if(arrayAligned(hourly.windDirection10m,hourlyLength)&&!arrayValuesValid(hourly.windDirection10m,direction))issues.push('HOURLY_windDirection10m_INVALID');
    if(arrayAligned(hourly.weatherCode,hourlyLength)&&!arrayValuesValid(hourly.weatherCode,integer))issues.push('HOURLY_weatherCode_INVALID');
    if(hourly.timestampEpochMs!=null){
      if(!arrayAligned(hourly.timestampEpochMs,hourlyLength))issues.push('HOURLY_timestampEpochMs_MISALIGNED');
      else if(hourly.timestampEpochMs.some(value=>!Number.isFinite(value)))issues.push('HOURLY_timestampEpochMs_INVALID');
      else for(let i=1;i<hourly.timestampEpochMs.length;i++)if(hourly.timestampEpochMs[i]<=hourly.timestampEpochMs[i-1]){issues.push('HOURLY_timestampEpochMs_NOT_INCREASING');break;}
    }
  }
  if(dailyLength>=0){
    for(const key of DAILY_KEYS)if(!arrayAligned(daily[key],dailyLength))issues.push(`DAILY_${key}_MISALIGNED`);
    for(const key of ['tempMax','tempMin'])if(arrayAligned(daily[key],dailyLength)&&!arrayValuesValid(daily[key],finiteNumber))issues.push(`DAILY_${key}_INVALID`);
    for(const key of ['precipitationSum','windSpeedMax','windGustsMax'])if(arrayAligned(daily[key],dailyLength)&&!arrayValuesValid(daily[key],nonNegative))issues.push(`DAILY_${key}_INVALID`);
    if(arrayAligned(daily.precipitationProbabilityMax,dailyLength)&&!arrayValuesValid(daily.precipitationProbabilityMax,percent))issues.push('DAILY_precipitationProbabilityMax_INVALID');
    if(arrayAligned(daily.windDirection10mDominant,dailyLength)&&!arrayValuesValid(daily.windDirection10mDominant,direction))issues.push('DAILY_windDirection10mDominant_INVALID');
    if(arrayAligned(daily.weatherCode,dailyLength)&&!arrayValuesValid(daily.weatherCode,integer))issues.push('DAILY_weatherCode_INVALID');
    for(const key of ['sunrise','sunset'])if(arrayAligned(daily[key],dailyLength)&&!arrayValuesValid(daily[key],textValue))issues.push(`DAILY_${key}_INVALID`);
    const completeness=daily.completeness;
    if(completeness!=null){
      if(!completeness||typeof completeness!=='object')issues.push('DAILY_COMPLETENESS_INVALID');
      else for(const key of ['temperature','precipitation','wind','condition'])if(!arrayAligned(completeness[key],dailyLength))issues.push(`DAILY_COMPLETENESS_${key}_MISALIGNED`);
    }
  }
  return issues;
}

export function forecastPayloadIssues(payload,{cityId=null}={}){
  const issues=[];
  if(!payload||typeof payload!=='object')return ['FORECAST_NOT_OBJECT'];
  const city=normalizeCity(payload.city);
  if(!city)issues.push('CITY_INVALID');
  else if(cityId!=null&&city.id!==String(cityId))issues.push('CITY_ID_MISMATCH');
  if(!Number.isFinite(Date.parse(payload.fetchedAt||'')))issues.push('FETCHED_AT_INVALID');
  const series=payload.seriesByModel;
  if(!series||typeof series!=='object'||Array.isArray(series))issues.push('SERIES_MAP_INVALID');
  else {
    const ids=Object.keys(series);
    if(!ids.length)issues.push('SERIES_EMPTY');
    for(const id of ids){
      if(!KNOWN_MODEL_IDS.has(id)){issues.push(`MODEL_UNKNOWN:${id}`);continue;}
      for(const issue of forecastSeriesIssues(series[id]))issues.push(`${id}:${issue}`);
    }
  }
  return issues;
}

export function isForecastPayloadValid(payload,context={}){ return forecastPayloadIssues(payload,context).length===0; }

export function normalizeForecastPayload(payload,{cityId=null}={}){
  if(!payload||typeof payload!=='object')return null;
  const city=normalizeCity(payload.city);if(!city||(cityId!=null&&city.id!==String(cityId)))return null;
  if(!Number.isFinite(Date.parse(payload.fetchedAt||'')))return null;
  const seriesByModel={},modelMeta={},errors={};
  for(const [id,series] of Object.entries(payload.seriesByModel||{})){
    if(!KNOWN_MODEL_IDS.has(id)||forecastSeriesIssues(series).length)continue;
    seriesByModel[id]=series;
    if(payload.modelMeta?.[id]&&typeof payload.modelMeta[id]==='object')modelMeta[id]=payload.modelMeta[id];
  }
  for(const [id,error] of Object.entries(payload.errors||{}))if(KNOWN_MODEL_IDS.has(id)&&error!=null)errors[id]=error;
  if(!Object.keys(seriesByModel).length)return null;
  const timezone=validTimezone(payload.timezone)||city.timezone||'UTC';
  return {
    ...payload,
    city:{...city,timezone:validTimezone(city.timezone)||timezone},
    timezone,
    seriesByModel,
    modelMeta,
    errors,
    requestedModelIds:normalizeModelIds(payload.requestedModelIds,{fallback:false}),
  };
}
