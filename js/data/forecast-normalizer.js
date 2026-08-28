import { zonedTimestampEpochs } from '../domain.js';
import { normalizeForecastPayload } from './contracts.js';

function values(raw, baseKey, model, single, allowShared=false) {
  const keys = [model.apiKey, ...model.aliases].map(key => `${baseKey}_${key}`);
  if (single || allowShared) keys.push(baseKey);
  for (const key of keys) if (Array.isArray(raw?.[key])) return raw[key];
  return null;
}
function numberList(value, predicate=Number.isFinite) { return Array.isArray(value) ? value.map(x => predicate(x) ? x : null) : null; }
function intList(value, predicate=Number.isFinite) { return Array.isArray(value) ? value.map(x => Number.isInteger(x) && predicate(x) ? x : null) : null; }
function strings(value) { return Array.isArray(value) ? value.map(x => typeof x === 'string' ? x : null) : null; }
function alignIndices(indices, vals) { return indices.map(i=>vals?.[i] ?? null); }
function cloudCover(hourly, model, single) {
  const total = intList(values(hourly,'cloud_cover',model,single), x=>x>=0&&x<=100);
  if (total?.some(x=>x!==null)) return total;
  const layers = ['cloud_cover_low','cloud_cover_mid','cloud_cover_high'].map(key=>intList(values(hourly,key,model,single),x=>x>=0&&x<=100));
  const size = Math.max(0, ...layers.map(x=>x?.length||0));
  if (!size) return total;
  return Array.from({length:size},(_,i)=> {
    const valid=layers.map(array=>array?.[i]).filter(x=>Number.isInteger(x)&&x>=0&&x<=100);
    return valid.length ? Math.max(...valid) : null;
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
function finiteCoverage(timestamps, values) {
  if(!Array.isArray(timestamps)||!timestamps.length||!Array.isArray(values))return {firstTimestamp:null,lastTimestamp:null,count:0};
  let firstTimestamp=null,lastTimestamp=null,count=0;
  const n=Math.min(timestamps.length,values.length);
  for(let i=0;i<n;i++){
    if(!Number.isFinite(values[i])||typeof timestamps[i]!=='string'||!timestamps[i])continue;
    if(firstTimestamp==null)firstTimestamp=timestamps[i];
    lastTimestamp=timestamps[i];count++;
  }
  return {firstTimestamp,lastTimestamp,count};
}
function seriesCoverage(series) {
  const hourly=series?.hourly,timestamps=hourly?.timestamps||[];
  const coverageByVariable={
    temperature:finiteCoverage(timestamps,hourly?.temperature2m),
    precipitation:finiteCoverage(timestamps,hourly?.precipitation),
    wind:finiteCoverage(timestamps,hourly?.windSpeed10m),
    conditions:finiteCoverage(timestamps,hourly?.weatherCode),
  };
  let firstTimestamp=null,lastTimestamp=null,count=0;
  for(let i=0;i<timestamps.length;i++){
    const usable=[hourly?.temperature2m?.[i],hourly?.precipitation?.[i],hourly?.windSpeed10m?.[i]].every(Number.isFinite);
    if(!usable)continue;
    if(firstTimestamp==null)firstTimestamp=timestamps[i];lastTimestamp=timestamps[i];count++;
  }
  return {firstTimestamp,lastTimestamp,count,coverageByVariable};
}

export function hourlySeriesHealth(series, model, requestedHours) {
  const hourly=series?.hourly||{}, expected=Math.max(1,Math.min(Number(requestedHours)||hourly.timestamps?.length||1,model.horizonHours||requestedHours||1));
  const critical={temperature:hourly.temperature2m,precipitation:hourly.precipitation,wind:hourly.windSpeed10m};
  const count=array=>Array.isArray(array)?array.filter(Number.isFinite).length:0;
  const counts=Object.fromEntries(Object.entries(critical).map(([key,array])=>[key,count(array)]));
  const criticalMin=Math.min(...Object.values(counts)),criticalMax=Math.max(...Object.values(counts)),criticalTotal=Object.values(counts).reduce((a,b)=>a+b,0);
  const shortRegional=(model.horizonHours||expected)<=60;
  const minimum=Math.min(expected,shortRegional?Math.max(8,Math.floor(expected*.25)):Math.max(24,Math.floor(expected*.55)));
  const imbalanceTolerance=Math.max(3,Math.ceil(criticalMax*.18));
  const severeShort=criticalMax<minimum;
  const variableImbalance=criticalMax>=8&&(criticalMax-criticalMin)>imbalanceTolerance;
  const sparseCritical=criticalMax>=8&&criticalMin<Math.max(6,Math.floor(criticalMax*.72));
  const canAssessAlignment=Array.isArray(hourly.timestamps)&&hourly.timestamps.length>0;
  const usableIndices=canAssessAlignment?hourly.timestamps.map((_,i)=>[hourly.temperature2m?.[i],hourly.precipitation?.[i],hourly.windSpeed10m?.[i]].every(Number.isFinite)?i:-1).filter(i=>i>=0):[];
  const alignedCount=canAssessAlignment?usableIndices.length:criticalMin;
  const usableSpan=usableIndices.length?usableIndices.at(-1)-usableIndices[0]+1:0;
  const internalGaps=canAssessAlignment?Math.max(0,usableSpan-alignedCount):0;
  const fragmented=canAssessAlignment&&criticalMin>=8&&internalGaps>Math.max(2,Math.floor(criticalMin*.1));
  const degraded=severeShort||variableImbalance||sparseCritical||fragmented;
  return {expected,minimum,counts,criticalMin,criticalMax,criticalTotal,alignedCount,internalGaps,ratio:Math.min(1,criticalMin/expected),degraded,severeShort,variableImbalance,sparseCritical,fragmented,shortRegional,score:alignedCount*1_000_000+criticalMin*1000+criticalTotal};
}

function civilDayAxis(timestamps,date){
  const indices=[];for(let i=0;i<(timestamps||[]).length;i++)if(typeof timestamps[i]==='string'&&timestamps[i].slice(0,10)===date)indices.push(i);
  const first=indices.length?timestamps[indices[0]]:'' ,last=indices.length?timestamps[indices.at(-1)]:'';
  const full=indices.length>=23&&indices.length<=25&&first?.slice(11,16)==='00:00'&&last?.slice(11,16)==='23:00';
  return {indices,full,expectedHours:indices.length};
}
function metricCompleteness(axis,values,current=false){
  if(!axis.indices.length)return {status:'UNKNOWN',availableHours:0,expectedHours:0};
  const availableHours=axis.indices.filter(i=>Number.isFinite(values?.[i])).length;
  if(current)return {status:'CURRENT',availableHours,expectedHours:axis.expectedHours};
  if(!availableHours)return {status:'UNAVAILABLE',availableHours:0,expectedHours:axis.expectedHours};
  const complete=axis.full&&availableHours===axis.indices.length;
  return {status:complete?'FULL':'PARTIAL',availableHours,expectedHours:axis.expectedHours};
}
export function sanitizeIncompleteFutureDaily(series) {
  const hourly=series?.hourly,daily=series?.daily;if(!hourly?.timestamps?.length||!daily?.dates?.length)return series;
  const currentDate=hourly.timestamps.find(ts=>typeof ts==='string'&&ts)?.slice(0,10)||daily.dates[0]||null;
  const completeness={temperature:[],precipitation:[],wind:[],condition:[]};
  for(let index=0;index<daily.dates.length;index++){
    const date=daily.dates[index],axis=civilDayAxis(hourly.timestamps,date),current=date===currentDate;
    completeness.temperature[index]=metricCompleteness(axis,hourly.temperature2m,current);
    completeness.precipitation[index]=metricCompleteness(axis,hourly.precipitation,current);
    completeness.wind[index]=metricCompleteness(axis,hourly.windSpeed10m,current);
    completeness.condition[index]=metricCompleteness(axis,hourly.weatherCode,current);
  }
  daily.completeness=completeness;
  return series;
}

export function normalizeBatchedForecast(raw, city, models, requestedHours=null) {
  const hourlyRaw = raw?.hourly || {};
  const dailyRaw = raw?.daily || {};
  const hourlySource = Array.isArray(hourlyRaw.time) ? hourlyRaw.time.map(x=>typeof x==='string'?x:'') : [];
  const dailySource = Array.isArray(dailyRaw.time) ? dailyRaw.time.map(x=>typeof x==='string'?x:'') : [];
  const hourlyIndices = hourlySource.map((value,index)=>value.trim()?index:-1).filter(index=>index>=0);
  const dailyIndices = dailySource.map((value,index)=>value.trim()?index:-1).filter(index=>index>=0);
  const hourlyTime = hourlyIndices.map(index=>hourlySource[index]);
  const dailyTime = dailyIndices.map(index=>dailySource[index]);
  const single = models.length===1;
  const resolvedTimezone=raw?.timezone || city.timezone || 'UTC';
  const hourlyEpochs=zonedTimestampEpochs(hourlyTime,resolvedTimezone);
  const seriesByModel = {};
  const modelMeta = {};
  const errors = {};
  for (const model of models) {
    const tempH = numberList(values(hourlyRaw,'temperature_2m',model,single));
    const tempMax = numberList(values(dailyRaw,'temperature_2m_max',model,single));
    const tempMin = numberList(values(dailyRaw,'temperature_2m_min',model,single));
    const usable = (tempH||[]).some(Number.isFinite) || (tempMax||[]).some(Number.isFinite) || (tempMin||[]).some(Number.isFinite);
    if (!usable) { errors[model.id]='MODEL_UNAVAILABLE'; continue; }
    const series = {
      modelId:model.id,
      hourly:{
        timestamps:[...hourlyTime],
        timestampEpochMs:[...hourlyEpochs],
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
    sanitizeIncompleteFutureDaily(series);
    seriesByModel[model.id]=series;
    const coverage=seriesCoverage(series),health=hourlySeriesHealth(series,model,requestedHours||hourlyTime.length);
    modelMeta[model.id]={ runTimestamp:modelRunTimestamp(raw,model), ...coverage, hourlyHealth:health, sourceApiKey:model.apiKey, resolutionKm:model.resolutionKm||null, nativeStepMinutes:model.nativeStepMinutes||60, updateMinutes:model.updateMinutes||null };
  }
  if (!Object.keys(seriesByModel).length) { const error=new Error('NO_USABLE_MODELS'); error.code='NO_USABLE_MODELS'; throw error; }
  const fetchedAt=new Date().toISOString();
  for(const meta of Object.values(modelMeta))meta.loadedAt=fetchedAt;
  const result={ city:{...city, timezone:resolvedTimezone}, timezone:resolvedTimezone, seriesByModel, modelMeta, errors, requestedModelIds:models.map(model=>model.id), fetchedAt };
  const normalized=normalizeForecastPayload(result,{cityId:city.id});
  if(!normalized){const error=new Error('NORMALIZED_FORECAST_CONTRACT_FAILED');error.code='NORMALIZED_FORECAST_CONTRACT_FAILED';throw error;}
  return normalized;
}
