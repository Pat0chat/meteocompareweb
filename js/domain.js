import { CONDITION, CONDITION_INFO, consensusGroupFor } from './models.js';
import { continuousConsensus, precipitationConsensus, weatherConditionConsensus, familyBalancedWeights, RAIN_THRESHOLD_MM, isWetPrecipitation } from './consensus.js';
import { DEFAULT_FORECAST_ENGINE, forecastEngineContinuous, forecastEnginePrecipitation, forecastEngineSummary } from './forecast-engines.js';
import { FORECAST_PHYSICAL_LIMITS, isWithinPhysicalLimits, evidenceLevelForFamilies } from './data/forecast-quality.js';

const zonedFormatters = new Map();
const timezoneValidity = new Map();
const dateLabelFormatters = new Map();
function zonedFormatter(tz){
  let f=zonedFormatters.get(tz);
  if(!f){f=new Intl.DateTimeFormat('en-CA',{ timeZone:tz, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' });zonedFormatters.set(tz,f);}
  return f;
}

export function fromWmoCode(code) {
  if (code == null) return null;
  if (code === 0) return CONDITION.CLEAR;
  if (code === 1) return CONDITION.MAINLY_CLEAR;
  if (code === 2) return CONDITION.PARTLY_CLOUDY;
  if (code === 3) return CONDITION.OVERCAST;
  if ([45,48].includes(code)) return CONDITION.FOG;
  if ([51,53,55].includes(code)) return CONDITION.DRIZZLE;
  if ([56,57,66,67].includes(code)) return CONDITION.FREEZING_RAIN;
  if ([61,63,65].includes(code)) return CONDITION.RAIN;
  if ([71,73,75,77].includes(code)) return CONDITION.SNOW;
  if ([80,81,82].includes(code)) return CONDITION.RAIN_SHOWERS;
  if ([85,86].includes(code)) return CONDITION.SNOW_SHOWERS;
  if ([95,96,99].includes(code)) return CONDITION.THUNDERSTORM;
  return CONDITION.UNKNOWN;
}
export function inferCondition(precip, temp, cloud) {
  if (Number.isFinite(precip)) {
    const freezing = (Number.isFinite(temp) ? temp : 10) <= 0;
    if (precip >= 5) return freezing ? CONDITION.SNOW : CONDITION.RAIN;
    if (precip >= 1) return freezing ? CONDITION.SNOW_SHOWERS : CONDITION.RAIN_SHOWERS;
    if (isWetPrecipitation(precip)) return freezing ? CONDITION.SNOW_SHOWERS : CONDITION.DRIZZLE;
  }
  if (Number.isFinite(cloud)) {
    if (cloud < 15) return CONDITION.CLEAR;
    if (cloud < 40) return CONDITION.MAINLY_CLEAR;
    if (cloud < 70) return CONDITION.PARTLY_CLOUDY;
    return CONDITION.OVERCAST;
  }
  return null;
}

export function conditionInfo(condition){ return CONDITION_INFO[condition] || CONDITION_INFO.UNKNOWN; }

export function zonedParts(date, timezone) {
  const tz = safeTimezone(timezone);
  const parts = zonedFormatter(tz).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
export function cityToday(timezone, date=new Date()) {
  const p=zonedParts(date,timezone); return `${p.year}-${p.month}-${p.day}`;
}
export function safeTimezone(tz) {
  const candidate=tz||'UTC';
  if(timezoneValidity.has(candidate))return timezoneValidity.get(candidate);
  let valid='UTC';try{new Intl.DateTimeFormat('en',{timeZone:candidate}).format();valid=candidate;}catch{}
  timezoneValidity.set(candidate,valid);return valid;
}
export function localTimestampValue(s) { if(typeof s!=='string') return NaN; const m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/); if(!m)return NaN; return Date.UTC(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0)); }
const localEpoch=localTimestampValue;

function physicalValue(value,limits){return isWithinPhysicalLimits(value,limits)?value:null;}
function dailyTemperatureValues(series,index){
  const max=physicalValue(series?.daily?.tempMax?.[index],FORECAST_PHYSICAL_LIMITS.temperatureC),min=physicalValue(series?.daily?.tempMin?.[index],FORECAST_PHYSICAL_LIMITS.temperatureC);
  return Number.isFinite(max)&&Number.isFinite(min)&&max<min?{max:null,min:null}:{max,min};
}
function engineQualityBounds(variable){
  if(variable==='temperature')return {qualityMin:FORECAST_PHYSICAL_LIMITS.temperatureC.min,qualityMax:FORECAST_PHYSICAL_LIMITS.temperatureC.max};
  if(variable==='wind')return {qualityMin:FORECAST_PHYSICAL_LIMITS.windKmh.min,qualityMax:FORECAST_PHYSICAL_LIMITS.windKmh.max};
  if(variable==='condition')return {qualityMin:FORECAST_PHYSICAL_LIMITS.cloudPercent.min,qualityMax:FORECAST_PHYSICAL_LIMITS.cloudPercent.max};
  return {};
}
function engineConfig(options={},variable='temperature',tight=.5,wide=3,extra={}){
  return {engine:options?.forecastEngine||DEFAULT_FORECAST_ENGINE,localWeights:options?.weightsByVariable?.[variable]||{},calibration:options?.calibrationByVariable?.[variable]||{},tight,wide,...engineQualityBounds(variable),...extra};
}


/** Convert a timezone-less local ISO timestamp to an absolute epoch for its IANA timezone.
 * Multiple candidates can exist during the autumn DST fold. When a reference is supplied,
 * the candidate closest to that expected instant is selected. */
export function zonedLocalTimestampEpoch(localTs, timezone, referenceEpochMs=null){
  const target=localTimestampValue(localTs);if(!Number.isFinite(target))return NaN;const tz=safeTimezone(timezone),offsets=new Set();
  for(let h=-36;h<=36;h+=6){const probe=target+h*3600e3,p=zonedParts(new Date(probe),tz),wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);if(Number.isFinite(wall))offsets.add(Math.round((wall-probe)/60000)*60000);}
  const candidates=[];for(const offset of offsets){const candidate=target-offset,p=zonedParts(new Date(candidate),tz),wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);if(wall===target)candidates.push(candidate);}
  if(!candidates.length)return NaN;if(candidates.length===1)return candidates[0];
  const ref=Number.isFinite(referenceEpochMs)?referenceEpochMs:null;return ref==null?Math.min(...candidates):candidates.sort((a,b)=>Math.abs(a-ref)-Math.abs(b-ref)||a-b)[0];
}
export function zonedTimestampEpochs(timestamps,timezone){let previous=null;return (timestamps||[]).map(ts=>{const expected=previous==null?null:previous+3600e3,ms=zonedLocalTimestampEpoch(ts,timezone,expected);if(Number.isFinite(ms))previous=ms;return ms;});}
export function addDays(dateStr, days){ const d=new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function daysBetween(a,b){ return Math.round((localEpoch(b)-localEpoch(a))/86400000); }
function dailyCalibrationLeadDay(forecast,date){const fetched=Date.parse(forecast?.fetchedAt);if(!Number.isFinite(fetched)||typeof date!=='string')return null;const timezone=forecast?.city?.timezone||forecast?.timezone||'UTC',issuedDate=cityToday(timezone,new Date(fetched)),lead=daysBetween(issuedDate,date);return Number.isInteger(lead)&&lead>=0&&lead<=7?lead:null;}

export function roundedHourLocal(timezone, now=new Date()) {
  const tz=safeTimezone(timezone),p=zonedParts(now,tz),wall=`${p.year}-${p.month}-${p.day}T${p.hour}:00`,wallNow=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second),offset=wallNow-now.getTime(),start=localTimestampValue(wall)-offset;
  if(!Number.isFinite(start))return wall;
  const rounded=+p.minute>30?start+3600e3:start;return localHourFromEpoch(rounded,tz);
}

function localHourFromEpoch(epochMs,timezone){const p=zonedParts(new Date(epochMs),timezone);return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;}
function roundedHourEpoch(timezone,now=new Date()){const local=roundedHourLocal(timezone,now),ms=zonedLocalTimestampEpoch(local,timezone,now.getTime());return Number.isFinite(ms)?ms:now.getTime();}
function hourlyAxis(series,timezone){const hourly=series?.hourly||{},ts=hourly.timestamps||[],cached=hourly.timestampEpochMs;let epochs;if(Array.isArray(cached)&&cached.length===ts.length)epochs=cached;else{epochs=zonedTimestampEpochs(ts,timezone);if(Array.isArray(hourly.timestamps))hourly.timestampEpochMs=epochs;}const indexByEpoch=new Map(),rows=[];for(let i=0;i<ts.length;i++){const epochMs=epochs[i];if(!Number.isFinite(epochMs))continue;rows.push({timestamp:ts[i],epochMs,index:i});indexByEpoch.set(epochMs,i);}return {rows,indexByEpoch};}

function stats(values) {
  const a=values.filter(Number.isFinite); if(!a.length)return null; const mean=a.reduce((s,v)=>s+v,0)/a.length; const variance=a.reduce((s,v)=>s+(v-mean)**2,0)/a.length;
  return { mean, stdDev:Math.sqrt(variance), min:Math.min(...a), max:Math.max(...a), count:a.length };
}
function dailyCompletenessEntry(series,index,metric){return series?.daily?.completeness?.[metric]?.[index]||null;}
export function dailyMetricIsComparable(series,index,metric){const status=dailyCompletenessEntry(series,index,metric)?.status;return status==null||status==='FULL'||status==='CURRENT'||status==='UNKNOWN';}
const dailyMetricComparable=dailyMetricIsComparable;

export function dayConfidence(forecast,date,weightsByVariable={}){
  const rows=Object.entries(forecast.seriesByModel||{}).map(([modelId,series])=>{const i=series.daily.dates.indexOf(date);return i<0?null:{modelId,series,i};}).filter(Boolean);
  const entries=(metric,key)=>rows.map(x=>{if(!dailyMetricComparable(x.series,x.i,metric))return null;let value=null;if(key==='tempMax'||key==='tempMin'){const pair=dailyTemperatureValues(x.series,x.i);value=key==='tempMax'?pair.max:pair.min;}else if(key==='windSpeedMax')value=physicalValue(x.series.daily[key][x.i],FORECAST_PHYSICAL_LIMITS.windKmh);else if(key==='windGustsMax')value=physicalValue(x.series.daily[key][x.i],FORECAST_PHYSICAL_LIMITS.gustKmh);else value=x.series.daily[key][x.i];return Number.isFinite(value)?{modelId:x.modelId,value}:null;}).filter(Boolean);
  const continuous=(metric,key,weightKey,tight,wide)=>{const c=continuousConsensus(entries(metric,key),weightsByVariable?.[weightKey]||{},tight,wide);return c.stats?{...c.stats,central:c.central,percent:c.convergencePercent,spread:c.stats.max-c.stats.min,familyCount:c.familyCount,evidenceLevel:evidenceLevelForFamilies(c.familyCount)}:null;};
  const tempMax=continuous('temperature','tempMax','temperature',.5,3),tempMin=continuous('temperature','tempMin','temperature',.5,3),windMax=continuous('wind','windSpeedMax','wind',2,12),windGustMax=continuous('wind','windGustsMax','wind',2,12);
  const precipRows=rows.filter(x=>dailyMetricComparable(x.series,x.i,'precipitation')).map(x=>({modelId:x.modelId,amount:physicalValue(x.series.daily.precipitationSum[x.i],FORECAST_PHYSICAL_LIMITS.precipitationDailyMm),probability:physicalValue(x.series.daily.precipitationProbabilityMax[x.i],FORECAST_PHYSICAL_LIMITS.precipitationProbabilityPercent)}));
  const pc=precipitationConsensus(precipRows,{threshold:RAIN_THRESHOLD_MM,localWeights:weightsByVariable?.precipitation||{},amountTight:1,amountWide:8,amountMax:FORECAST_PHYSICAL_LIMITS.precipitationDailyMm.max});
  const precipitation=pc.count>0?{kind:pc.wetModelCount===0?'NO_RAIN':pc.wetModelCount===pc.count?'RAIN':'DIVIDED',percent:pc.convergencePercent,count:pc.count,familyCount:pc.familyCount,evidenceLevel:evidenceLevelForFamilies(pc.familyCount),modelsForRain:pc.wetModelCount,modelsAgainstRain:Math.max(0,pc.count-pc.wetModelCount),rainMinMm:pc.minMm,rainMaxMm:pc.maxMm,rainMeanMm:pc.conditionalAmountMm,probabilityPercent:pc.probabilityPercent,conditionalAmountMm:pc.conditionalAmountMm,expectedAmountMm:pc.expectedAmountMm,occurrenceAgreementPercent:pc.occurrenceConvergencePercent,amountAgreementPercent:pc.amountConvergencePercent,probabilityStdDevPercent:pc.probabilityStdDevPercent,source:pc.source}:null;
  const conditionRows=rows.filter(x=>dailyMetricComparable(x.series,x.i,'condition')).map(x=>{const vote=dailyCondition(x.series,date);return vote.condition?{modelId:x.modelId,value:vote.condition}:null;}).filter(Boolean);
  const conditionVote=weatherConditionConsensus(conditionRows,{},value=>conditionInfo(value).severity);
  const condition=conditionVote.value?{value:conditionVote.value,percent:conditionVote.percent,count:conditionVote.count,familyCount:conditionVote.familyCount,evidenceLevel:evidenceLevelForFamilies(conditionVote.familyCount)}:null;
  const tempScores=[tempMax?.percent,tempMin?.percent].filter(Number.isFinite),temperaturePercent=tempScores.length?tempScores.reduce((a,b)=>a+b,0)/tempScores.length:null;
  const components={TEMPERATURE:temperaturePercent,PRECIPITATION:precipitation?.percent??null,WIND:windMax?.percent??null,CONDITION:condition?.percent??null};
  const scores=Object.values(components).filter(Number.isFinite),overall=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
  const divergenceReasons=Object.entries(components).filter(([,value])=>Number.isFinite(value)&&value<50).map(([key])=>key);
  const familyCount=Math.max(tempMax?.familyCount||0,tempMin?.familyCount||0,precipitation?.familyCount||0,windMax?.familyCount||0,condition?.familyCount||0);
  return {date,tempMax,tempMin,windMax,windGustMax,precipitation,condition,temperaturePercent,components,divergenceReasons,familyCount,evidenceLevel:evidenceLevelForFamilies(familyCount),overallPercent:overall,convergencePercent:overall};
}

export function hourlyCondition(series,index){
  if(!series?.hourly||index==null||index<0)return {condition:null,inferred:false};
  const native=fromWmoCode(physicalValue(series.hourly.weatherCode?.[index],FORECAST_PHYSICAL_LIMITS.weatherCode));
  if(native&&native!==CONDITION.UNKNOWN)return {condition:native,inferred:false};
  const condition=inferCondition(physicalValue(series.hourly.precipitation?.[index],FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm),physicalValue(series.hourly.temperature2m?.[index],FORECAST_PHYSICAL_LIMITS.temperatureC),physicalValue(series.hourly.cloudCover?.[index],FORECAST_PHYSICAL_LIMITS.cloudPercent));
  return {condition:condition&&condition!==CONDITION.UNKNOWN?condition:null,inferred:Boolean(condition&&condition!==CONDITION.UNKNOWN)};
}

/* Aggregate weather conditions have a different provenance from a single-model
   fallback. Prefer a real multi-family vote of native WMO codes. When native
   categorical coverage is too narrow, derive one condition from the already
   aggregated consensus variables instead of letting per-model heuristics pose
   as the final consensus. */
function resolveAggregateCondition(rows,{temperature=null,precipitation=null,cloud=null}={}){
  const usable=(rows||[]).filter(row=>row?.modelId&&row.condition&&row.condition!==CONDITION.UNKNOWN);
  const native=usable.filter(row=>!row.conditionInferred);
  const voteFor=list=>weatherConditionConsensus(list.map(row=>({modelId:row.modelId,value:row.condition})),{},condition=>conditionInfo(condition).severity);
  const nativeVote=voteFor(native);
  const allVote=voteFor(usable);
  const nativeModelCount=native.length,derivedModelCount=Math.max(0,usable.length-native.length);

  if(nativeVote.value&&(nativeVote.familyCount>=2||usable.length===1)){
    return {condition:nativeVote.value,conditionInferred:false,conditionSource:nativeVote.familyCount>=2?'MODEL_CODE_CONSENSUS':'MODEL_CODE_LIMITED',conditionVote:nativeVote,nativeModelCount,derivedModelCount};
  }

  const derived=inferCondition(precipitation,temperature,cloud);
  if(derived&&derived!==CONDITION.UNKNOWN){
    const agreementVote=allVote.value===derived?allVote:{...allVote,percent:null};
    return {condition:derived,conditionInferred:true,conditionSource:'CONSENSUS_VARIABLES',conditionVote:agreementVote,nativeModelCount,derivedModelCount};
  }

  if(nativeVote.value){
    return {condition:nativeVote.value,conditionInferred:false,conditionSource:'MODEL_CODE_LIMITED',conditionVote:nativeVote,nativeModelCount,derivedModelCount};
  }
  if(allVote.value){
    return {condition:allVote.value,conditionInferred:true,conditionSource:'MODEL_DERIVED_CONSENSUS',conditionVote:allVote,nativeModelCount,derivedModelCount};
  }
  return {condition:null,conditionInferred:false,conditionSource:null,conditionVote:allVote,nativeModelCount,derivedModelCount};
}

export function currentConditions(forecast, now=new Date(), options={}) {
  const timezone=forecast.city?.timezone||forecast.timezone||'UTC',targetSlot=roundedHourEpoch(timezone,now),rows=[];
  for(const [modelId,series] of Object.entries(forecast.seriesByModel||{})){
    const axis=hourlyAxis(series,timezone),i=axis.indexByEpoch.get(targetSlot);if(i==null)continue;
    const vote=hourlyCondition(series,i);rows.push({modelId,temperature:physicalValue(series.hourly.temperature2m[i],FORECAST_PHYSICAL_LIMITS.temperatureC),precipitation:physicalValue(series.hourly.precipitation[i],FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm),precipitationProbability:physicalValue(series.hourly.precipitationProbability[i],FORECAST_PHYSICAL_LIMITS.precipitationProbabilityPercent),wind:physicalValue(series.hourly.windSpeed10m[i],FORECAST_PHYSICAL_LIMITS.windKmh),cloud:physicalValue(series.hourly.cloudCover[i],FORECAST_PHYSICAL_LIMITS.cloudPercent),condition:vote.condition,conditionInferred:vote.inferred});
  }
  const temp=forecastEngineContinuous(rows.map(x=>({modelId:x.modelId,value:x.temperature})),engineConfig(options,'temperature',.5,3,{calibration:{}})),wind=forecastEngineContinuous(rows.map(x=>({modelId:x.modelId,value:x.wind})),engineConfig(options,'wind',2,12,{min:0,calibration:{}})),cloud=forecastEngineContinuous(rows.map(x=>({modelId:x.modelId,value:x.cloud})),engineConfig(options,'condition',10,50,{min:0,max:100})),precip=forecastEnginePrecipitation(rows.map(x=>({modelId:x.modelId,amount:x.precipitation,probability:x.precipitationProbability})),{...engineConfig(options,'precipitation',.5,4,{calibration:{}}),threshold:RAIN_THRESHOLD_MM,amountTight:.5,amountWide:4,amountMax:FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm.max});
  const resolved=resolveAggregateCondition(rows,{temperature:temp.central,precipitation:precip.conditionAmountMm,cloud:cloud.central}),cv=resolved.conditionVote;
  return {temperature:temp.central,wind:wind.central,cloudCover:Number.isFinite(cloud.central)?Math.round(cloud.central):null,condition:resolved.condition,conditionInferred:resolved.conditionInferred,conditionSource:resolved.conditionSource,conditionNativeModelCount:resolved.nativeModelCount,conditionDerivedModelCount:resolved.derivedModelCount,modelCount:rows.length,familyCount:Math.max(temp.familyCount,wind.familyCount,cv.familyCount),forecastEngine:options?.forecastEngine||DEFAULT_FORECAST_ENGINE,engineDetails:{temperature:forecastEngineSummary(temp),precipitation:forecastEngineSummary(precip),wind:forecastEngineSummary(wind),cloud:forecastEngineSummary(cloud)}};
}

export function dailyCloudCoverMean(series,date){
  const vals=[];series.hourly.timestamps.forEach((ts,i)=>{if(ts.slice(0,10)===date){const v=series.hourly.cloudCover[i];if(Number.isInteger(v)&&v>=0&&v<=100)vals.push(v);}});return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null;
}
export function dailyPrecipitationTemperature(series,date){
  const hourly=series?.hourly||{},timestamps=hourly.timestamps||[];let weighted=0,weight=0;
  for(let i=0;i<timestamps.length;i++){
    if(typeof timestamps[i]!=='string'||timestamps[i].slice(0,10)!==date)continue;
    const p=physicalValue(hourly.precipitation?.[i],FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm),t=hourly.temperature2m?.[i];
    if(!isWetPrecipitation(p)||!isWithinPhysicalLimits(t,FORECAST_PHYSICAL_LIMITS.temperatureC))continue;
    weighted+=t*p;weight+=p;
  }
  return weight>0?weighted/weight:null;
}
export function dailyCondition(series,date){
  const di=series.daily.dates.indexOf(date); if(di>=0){const c=fromWmoCode(physicalValue(series.daily.weatherCode?.[di],FORECAST_PHYSICAL_LIMITS.weatherCode));if(c&&c!==CONDITION.UNKNOWN)return {condition:c,inferred:false};}
  const codes=[];let precip=0,pCount=0,clouds=[];
  series.hourly.timestamps.forEach((ts,i)=>{if(ts.slice(0,10)!==date)return;const c=fromWmoCode(physicalValue(series.hourly.weatherCode?.[i],FORECAST_PHYSICAL_LIMITS.weatherCode));if(c&&c!==CONDITION.UNKNOWN)codes.push(c);const p=physicalValue(series.hourly.precipitation?.[i],FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm);if(Number.isFinite(p)){precip+=p;pCount++;}const cl=physicalValue(series.hourly.cloudCover?.[i],FORECAST_PHYSICAL_LIMITS.cloudPercent);if(Number.isFinite(cl))clouds.push(cl);});
  if(codes.length){const condition=weatherConditionConsensus(codes.map((value,index)=>({modelId:`hour-${index}`,value})),{},value=>conditionInfo(value).severity).value;return {condition,inferred:true};}
  const precipTemperature=dailyPrecipitationTemperature(series,date);
  const cond=inferCondition(pCount?precip:null,precipTemperature,clouds.length?stats(clouds).mean:null);return cond?{condition:cond,inferred:true}:{condition:null,inferred:true};
}


export function hourlyConfidenceBand(forecast, metric='TEMPERATURE', horizonHours=168, now=new Date(), options={}) {
  const timezone=forecast.city?.timezone||forecast.timezone||'UTC';
  const series=Object.entries(forecast.seriesByModel||{});
  const axes=new Map(series.map(([,s])=>[s,hourlyAxis(s,timezone)]));
  const anchor=roundedHourEpoch(timezone,now);
  const weights=options?.weightsByVariable||{};
  const times=[...new Set(series.flatMap(([,s])=>(axes.get(s)?.rows||[]).map(row=>row.epochMs)))]
    .filter(epochMs=>epochMs>=anchor)
    .sort((a,b)=>a-b)
    .slice(0,horizonHours);
  const thresholds=['WIND','GUST'].includes(metric)?[2,12]:metric==='CLOUD'?[10,50]:[.5,3];
  const weightKey=['WIND','GUST'].includes(metric)?'wind':metric==='CLOUD'?'condition':['PRECIPITATION','PRECIPITATION_PROBABILITY'].includes(metric)?'precipitation':'temperature';

  return times.map(epochMs=>{
    const rows=[];
    for(const [modelId,modelSeries] of series){
      const index=axes.get(modelSeries)?.indexByEpoch.get(epochMs);
      if(index==null)continue;
      rows.push({
        modelId,
        timestamp:modelSeries.hourly.timestamps[index],
        temperature:physicalValue(modelSeries.hourly.temperature2m[index],FORECAST_PHYSICAL_LIMITS.temperatureC),
        wind:physicalValue(modelSeries.hourly.windSpeed10m[index],FORECAST_PHYSICAL_LIMITS.windKmh),
        gust:physicalValue(modelSeries.hourly.windGusts10m[index],FORECAST_PHYSICAL_LIMITS.gustKmh),
        cloud:physicalValue(modelSeries.hourly.cloudCover[index],FORECAST_PHYSICAL_LIMITS.cloudPercent),
        precipitation:physicalValue(modelSeries.hourly.precipitation[index],FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm),
        probability:physicalValue(modelSeries.hourly.precipitationProbability[index],FORECAST_PHYSICAL_LIMITS.precipitationProbabilityPercent),
      });
    }

    if(['PRECIPITATION','PRECIPITATION_PROBABILITY'].includes(metric)){
      const precipitationRows=rows.map(row=>({modelId:row.modelId,amount:row.precipitation,probability:row.probability}));
      const forecastValue=forecastEnginePrecipitation(precipitationRows,{
        ...engineConfig(options,'precipitation',.5,4,{calibration:{}}),
        threshold:RAIN_THRESHOLD_MM,amountTight:.5,amountWide:4,amountMax:FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm.max,
      });
      const agreement=precipitationConsensus(precipitationRows,{
        threshold:RAIN_THRESHOLD_MM,localWeights:weights.precipitation||{},amountTight:.5,amountWide:4,amountMax:FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm.max,
      });
      if(!forecastValue.count)return null;
      const effectiveProbabilities=rows.map(row=>Number.isFinite(row.probability)?row.probability:Number.isFinite(row.precipitation)?(isWetPrecipitation(row.precipitation)?100:0):null).filter(Number.isFinite);
      if(metric==='PRECIPITATION_PROBABILITY')return {
        timestamp:rows[0]?.timestamp||localHourFromEpoch(epochMs,timezone),epochMs,
        meanValue:forecastValue.probabilityPercent,
        minValue:effectiveProbabilities.length?Math.min(...effectiveProbabilities):null,
        maxValue:effectiveProbabilities.length?Math.max(...effectiveProbabilities):null,
        stdDev:agreement.probabilityStdDevPercent,
        percent:agreement.occurrenceConvergencePercent,modelCount:agreement.count,familyCount:agreement.familyCount,
        precipitationProbability:forecastValue.probabilityPercent,
        conditionalAmountMm:forecastValue.conditionalAmountMm,
        engineDetail:null,
      };
      const expectedEntries=rows.map(row=>({modelId:row.modelId,value:Number.isFinite(row.precipitation)?row.precipitation*(Number.isFinite(row.probability)?row.probability/100:1):null}));
      const expectedAgreement=continuousConsensus(expectedEntries,weights.precipitation||{},.5,4),engineDetail=forecastEngineSummary(forecastValue);
      return {
        timestamp:rows[0]?.timestamp||localHourFromEpoch(epochMs,timezone),epochMs,
        meanValue:forecastValue.expectedAmountMm,
        minValue:expectedAgreement.stats?.min??null,maxValue:expectedAgreement.stats?.max??null,stdDev:expectedAgreement.stats?.stdDev??null,
        percent:expectedAgreement.convergencePercent,modelCount:expectedAgreement.count,familyCount:expectedAgreement.familyCount,
        precipitationProbability:forecastValue.probabilityPercent,
        conditionalAmountMm:forecastValue.conditionalAmountMm,
        engineDetail,
      };
    }

    const key=metric==='WIND'?'wind':metric==='GUST'?'gust':metric==='CLOUD'?'cloud':'temperature';
    const entries=rows.map(row=>({modelId:row.modelId,value:row[key]}));
    const bounds=['WIND','GUST'].includes(metric)?{min:0,calibration:{}}:metric==='CLOUD'?{min:0,max:100,calibration:{}}:{calibration:{}};
    const forecastValue=forecastEngineContinuous(entries,engineConfig(options,weightKey,...thresholds,bounds));
    const agreement=continuousConsensus(entries,weights[weightKey]||{},...thresholds);
    if(!forecastValue.stats||!agreement.stats)return null;
    return {
      timestamp:rows[0]?.timestamp||localHourFromEpoch(epochMs,timezone),epochMs,
      meanValue:forecastValue.central,
      minValue:agreement.stats.min,maxValue:agreement.stats.max,stdDev:agreement.stats.stdDev,
      percent:agreement.convergencePercent,modelCount:agreement.count,familyCount:agreement.familyCount,
      engineDetail:forecastEngineSummary(forecastValue),
    };
  }).filter(Boolean);
}

export function aggregateDay(forecast, date, options={}) {
  const data=[];
  for(const [modelId,series] of Object.entries(forecast.seriesByModel||{})){
    const index=series.daily.dates.indexOf(date);
    if(index<0)continue;
    const dailyVote=dailyCondition(series,date),temperatures=dailyTemperatureValues(series,index);
    data.push({
      modelId,
      tempMax:temperatures.max,tempMin:temperatures.min,
      precip:physicalValue(series.daily.precipitationSum[index],FORECAST_PHYSICAL_LIMITS.precipitationDailyMm),cloud:dailyCloudCoverMean(series,date),
      wind:physicalValue(series.daily.windSpeedMax[index],FORECAST_PHYSICAL_LIMITS.windKmh),gust:physicalValue(series.daily.windGustsMax[index],FORECAST_PHYSICAL_LIMITS.gustKmh),
      direction:physicalValue(series.daily.windDirection10mDominant[index],FORECAST_PHYSICAL_LIMITS.directionDeg),precipProb:physicalValue(series.daily.precipitationProbabilityMax[index],FORECAST_PHYSICAL_LIMITS.precipitationProbabilityPercent),
      condition:dailyVote.condition,conditionInferred:dailyVote.inferred,precipTemperature:dailyPrecipitationTemperature(series,date),
      sunrise:series.daily.sunrise[index],sunset:series.daily.sunset[index],
      comparable:{
        temperature:dailyMetricComparable(series,index,'temperature'),
        precipitation:dailyMetricComparable(series,index,'precipitation'),
        wind:dailyMetricComparable(series,index,'wind'),
        condition:dailyMetricComparable(series,index,'condition'),
      },
    });
  }

  for(const row of data){
    row.precipExpectedSource=Number.isFinite(row.precip)
      ? (Number.isFinite(row.precipProb)?row.precip*(row.precipProb/100):row.precip)
      : null;
  }
  const weights=options?.weightsByVariable||{},calibrationLeadDay=dailyCalibrationLeadDay(forecast,date);
  const metricForKey=key=>['tempMax','tempMin'].includes(key)?'temperature':['wind','gust','direction'].includes(key)?'wind':['condition','cloud'].includes(key)?'condition':'precipitation';
  const entries=key=>data
    .filter(row=>row.comparable[metricForKey(key)]&&Number.isFinite(row[key]))
    .map(row=>({modelId:row.modelId,value:row[key]}));
  const calculate=(key,weightKey,tight,wide,extra={})=>forecastEngineContinuous(entries(key),engineConfig(options,weightKey,tight,wide,{leadDay:calibrationLeadDay,...extra}));
  const range=key=>{const values=entries(key).map(row=>row.value);return values.length?[Math.min(...values),Math.max(...values)]:[null,null];};

  const tempMax=calculate('tempMax','temperature',.5,3);
  const tempMin=calculate('tempMin','temperature',.5,3,{calibration:{}});
  const wind=calculate('wind','wind',2,12,{min:0});
  const gust=calculate('gust','wind',2,12,{min:0,calibration:{}});
  const precipRows=data.filter(row=>row.comparable.precipitation).map(row=>({modelId:row.modelId,amount:row.precip,probability:row.precipProb}));
  const precip=forecastEnginePrecipitation(precipRows,{...engineConfig(options,'precipitation',1,8,{leadDay:calibrationLeadDay}),threshold:RAIN_THRESHOLD_MM,amountTight:1,amountWide:8,amountMax:FORECAST_PHYSICAL_LIMITS.precipitationDailyMm.max});
  const cloudEntries=entries('cloud');
  const cloudConsensus=forecastEngineContinuous(cloudEntries,engineConfig(options,'condition',10,50,{min:0,max:100}));
  const cloudAgreement=continuousConsensus(cloudEntries,{},10,50);
  const precipTempForecast=forecastEngineContinuous(data.filter(row=>row.comparable.condition&&Number.isFinite(row.precipTemperature)).map(row=>({modelId:row.modelId,value:row.precipTemperature})),engineConfig(options,'temperature',.5,3,{calibration:{}}));
  const conditionResolution=resolveAggregateCondition(
    data.filter(row=>row.comparable.condition),
    {temperature:precipTempForecast.central,precipitation:precip.conditionAmountMm,cloud:cloudConsensus.central},
  );
  const conditionVote=conditionResolution.conditionVote;
  const condition=conditionResolution.condition,conditionInferred=conditionResolution.conditionInferred;
  const confidence=dayConfidence(forecast,date,weights);

  return {
    date,data,
    tempMax:tempMax.central,tempMin:tempMin.central,
    precip:precip.centralAmountMm,precipProbability:precip.probabilityPercent,
    precipConditional:precip.conditionalAmountMm,precipExpected:precip.expectedAmountMm,precipConditionAmount:precip.conditionAmountMm,
    precipitationDiagnostics:{probabilityPercent:precip.probabilityPercent,agreementPercent:precip.convergencePercent,occurrenceAgreementPercent:precip.occurrenceConvergencePercent,amountAgreementPercent:precip.amountConvergencePercent,dispersion:precip.dispersion||null,historicalReliabilityPercent:precip.historicalReliabilityPercent??null,evidenceLevel:precip.evidenceLevel||null},
    cloud:Number.isFinite(cloudConsensus.central)?Math.round(cloudConsensus.central):null,
    wind:wind.central,gust:gust.central,
    tempMaxRange:range('tempMax'),tempMinRange:range('tempMin'),precipRange:range('precipExpectedSource'),
    cloudRange:range('cloud'),windRange:range('wind'),gustRange:range('gust'),
    cloudConfidence:{
      percent:cloudAgreement.convergencePercent,
      count:cloudAgreement.count,
      familyCount:cloudAgreement.familyCount,
      evidenceLevel:evidenceLevelForFamilies(cloudAgreement.familyCount),
    },
    condition,conditionInferred,conditionSource:conditionResolution.conditionSource,conditionNativeModelCount:conditionResolution.nativeModelCount,conditionDerivedModelCount:conditionResolution.derivedModelCount,confidence,
    sunrise:data.find(row=>row.sunrise)?.sunrise||null,
    sunset:data.find(row=>row.sunset)?.sunset||null,
    consensusFamilyCount:Math.max(
      conditionVote.familyCount,
      confidence?.precipitation?.familyCount||0,
      cloudAgreement.familyCount,
    ),
    forecastEngine:options?.forecastEngine||DEFAULT_FORECAST_ENGINE,
    engineDetails:{
      tempMax:forecastEngineSummary(tempMax),tempMin:forecastEngineSummary(tempMin),
      precipitation:forecastEngineSummary(precip),cloud:forecastEngineSummary(cloudConsensus),
      wind:forecastEngineSummary(wind),gust:forecastEngineSummary(gust),
    },
  };
}

export function buildTimelinePoints(forecast, mode='HOURLY', now=new Date(), options={}) {
  const series=Object.entries(forecast.seriesByModel||{});
  if(!series.length)return [];

  const hourly=mode==='HOURLY';
  const rainThreshold=RAIN_THRESHOLD_MM;
  const timezone=forecast.city?.timezone||forecast.timezone||'UTC';
  const axes=hourly?new Map(series.map(([,modelSeries])=>[modelSeries,hourlyAxis(modelSeries,timezone)])):null;
  const weights=options?.weightsByVariable||{};
  const keys=hourly
    ? [...new Map(series.flatMap(([,modelSeries])=>(axes.get(modelSeries)?.rows||[]).map(row=>[row.epochMs,{timestamp:row.timestamp,epochMs:row.epochMs}]))).values()].sort((a,b)=>a.epochMs-b.epochMs)
    : [...new Set(series.flatMap(([,modelSeries])=>modelSeries.daily.dates||[]))].sort();

  let selected;
  if(hourly){
    const anchor=roundedHourEpoch(timezone,now),end=anchor+24*3600000;
    selected=keys.filter(slot=>slot.epochMs>=anchor&&slot.epochMs<end);
  }else{
    const today=cityToday(timezone,now);
    selected=keys.filter(date=>date>=today).slice(0,7);
  }

  return selected.map(slot=>{
    const key=hourly?slot.timestamp:slot;
    const epochMs=hourly?slot.epochMs:null;
    const calibrationLeadDay=hourly?null:dailyCalibrationLeadDay(forecast,key);
    const snaps=[];

    for(const [modelId,modelSeries] of series){
      const index=hourly?(axes.get(modelSeries)?.indexByEpoch.get(epochMs)??-1):modelSeries.daily.dates.indexOf(key);
      if(index<0)continue;
      const tempComparable=hourly||dailyMetricComparable(modelSeries,index,'temperature');
      const precipComparable=hourly||dailyMetricComparable(modelSeries,index,'precipitation');
      const windComparable=hourly||dailyMetricComparable(modelSeries,index,'wind');
      const conditionComparable=hourly||dailyMetricComparable(modelSeries,index,'condition');
      const dailyTemperatures=hourly?null:dailyTemperatureValues(modelSeries,index);
      const temperature=hourly?physicalValue(modelSeries.hourly.temperature2m[index],FORECAST_PHYSICAL_LIMITS.temperatureC):null;
      const tempMin=hourly?null:(tempComparable?dailyTemperatures.min:null);
      const tempMax=hourly?null:(tempComparable?dailyTemperatures.max:null);
      const precipitation=hourly?physicalValue(modelSeries.hourly.precipitation[index],FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm):(precipComparable?physicalValue(modelSeries.daily.precipitationSum[index],FORECAST_PHYSICAL_LIMITS.precipitationDailyMm):null);
      const precipitationProbability=hourly?physicalValue(modelSeries.hourly.precipitationProbability[index],FORECAST_PHYSICAL_LIMITS.precipitationProbabilityPercent):(precipComparable?physicalValue(modelSeries.daily.precipitationProbabilityMax[index],FORECAST_PHYSICAL_LIMITS.precipitationProbabilityPercent):null);
      const cloudCover=hourly?physicalValue(modelSeries.hourly.cloudCover[index],FORECAST_PHYSICAL_LIMITS.cloudPercent):(conditionComparable?dailyCloudCoverMean(modelSeries,key):null);
      const wind=hourly?physicalValue(modelSeries.hourly.windSpeed10m[index],FORECAST_PHYSICAL_LIMITS.windKmh):(windComparable?physicalValue(modelSeries.daily.windSpeedMax[index],FORECAST_PHYSICAL_LIMITS.windKmh):null);
      const windGust=hourly?physicalValue(modelSeries.hourly.windGusts10m[index],FORECAST_PHYSICAL_LIMITS.gustKmh):(windComparable?physicalValue(modelSeries.daily.windGustsMax[index],FORECAST_PHYSICAL_LIMITS.gustKmh):null);
      const precipTemperature=hourly?temperature:dailyPrecipitationTemperature(modelSeries,key);
      const native=fromWmoCode(hourly?modelSeries.hourly.weatherCode[index]:(conditionComparable?modelSeries.daily.weatherCode[index]:null));
      const condition=(native&&native!==CONDITION.UNKNOWN)?native:inferCondition(precipitation,precipTemperature,cloudCover);
      const conditionInferred=Boolean(condition&&condition!==CONDITION.UNKNOWN)&&!(native&&native!==CONDITION.UNKNOWN);
      if([temperature,tempMin,tempMax,precipitation,precipitationProbability,cloudCover,wind,windGust,precipTemperature].some(Number.isFinite)||(condition&&condition!==CONDITION.UNKNOWN)){
        snaps.push({modelId,temperature,tempMin,tempMax,precipitation,precipitationProbability,cloudCover,wind,windGust,precipTemperature,condition,conditionInferred});
      }
    }

    const tempEntries=snaps.map(row=>({modelId:row.modelId,value:hourly?row.temperature:row.tempMax}));
    const minEntries=hourly?[]:snaps.map(row=>({modelId:row.modelId,value:row.tempMin}));
    const windEntries=snaps.map(row=>({modelId:row.modelId,value:row.wind}));
    const gustEntries=snaps.map(row=>({modelId:row.modelId,value:row.windGust}));
    const cloudEntries=snaps.map(row=>({modelId:row.modelId,value:row.cloudCover}));
    const precipitationRows=snaps.map(row=>({modelId:row.modelId,amount:row.precipitation,probability:row.precipitationProbability}));

    const temperatureForecast=forecastEngineContinuous(tempEntries,engineConfig(options,'temperature',.5,3,hourly?{calibration:{}}:{leadDay:calibrationLeadDay}));
    const minForecast=hourly?null:forecastEngineContinuous(minEntries,engineConfig(options,'temperature',.5,3,{calibration:{}}));
    const windForecast=forecastEngineContinuous(windEntries,engineConfig(options,'wind',2,12,hourly?{min:0,calibration:{}}:{min:0,leadDay:calibrationLeadDay}));
    const gustForecast=forecastEngineContinuous(gustEntries,engineConfig(options,'wind',2,12,{min:0,calibration:{}}));
    const cloudForecast=forecastEngineContinuous(cloudEntries,engineConfig(options,'condition',10,50,{min:0,max:100}));
    const precipitationForecast=forecastEnginePrecipitation(precipitationRows,{
      ...engineConfig(options,'precipitation',hourly?.5:1,hourly?4:8,hourly?{calibration:{}}:{leadDay:calibrationLeadDay}),
      threshold:rainThreshold,amountTight:hourly?.5:1,amountWide:hourly?4:8,amountMax:hourly?FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm.max:FORECAST_PHYSICAL_LIMITS.precipitationDailyMm.max,
    });

    // Convergence deliberately stays independent from the selected forecast engine.
    // It describes the spread of the raw model families; only the central forecast uses the engine.
    const temperatureAgreement=continuousConsensus(tempEntries,weights.temperature||{},.5,3);
    const minAgreement=hourly?null:continuousConsensus(minEntries,weights.temperature||{},.5,3);
    const windAgreement=continuousConsensus(windEntries,weights.wind||{},2,12);
    const precipitationAgreement=precipitationConsensus(precipitationRows,{
      threshold:rainThreshold,localWeights:weights.precipitation||{},
      amountTight:hourly?.5:1,amountWide:hourly?4:8,amountMax:hourly?FORECAST_PHYSICAL_LIMITS.precipitationHourlyMm.max:FORECAST_PHYSICAL_LIMITS.precipitationDailyMm.max,
    });
    const precipTempForecast=hourly?temperatureForecast:forecastEngineContinuous(snaps.map(row=>({modelId:row.modelId,value:row.precipTemperature})),engineConfig(options,'temperature',.5,3,{calibration:{}}));
    const conditionResolution=resolveAggregateCondition(snaps,{
      temperature:precipTempForecast.central,
      precipitation:precipitationForecast.conditionAmountMm,
      cloud:cloudForecast.central,
    });
    const conditionVote=conditionResolution.conditionVote;
    const condition=conditionResolution.condition,conditionInferred=conditionResolution.conditionInferred;

    let consensusPercent=null,divergence=[];
    if(hourly){
      const metricScores=[];
      const pushAgreement=(name,value)=>{if(!Number.isFinite(value))return;metricScores.push(value);if(value<50)divergence.push(name);};
      pushAgreement('TEMPERATURE',temperatureAgreement.convergencePercent);
      pushAgreement('WIND',windAgreement.convergencePercent);
      pushAgreement('PRECIPITATION',precipitationAgreement.convergencePercent);
      pushAgreement('CONDITION',conditionVote.percent);
      consensusPercent=metricScores.length?Math.round(metricScores.reduce((a,b)=>a+b,0)/metricScores.length):null;
    }else{
      const dailyAgreement=dayConfidence(forecast,key,weights);
      consensusPercent=dailyAgreement.overallPercent;
      divergence=[...(dailyAgreement.divergenceReasons||[])];
    }
    const temperatures=snaps.map(row=>hourly?row.temperature:row.tempMax).filter(Number.isFinite);
    const precipitationAmounts=snaps.map(row=>row.precipitation).filter(Number.isFinite);
    const precipitationExpectedAmounts=snaps.map(row=>Number.isFinite(row.precipitation)?(Number.isFinite(row.precipitationProbability)?row.precipitation*(row.precipitationProbability/100):row.precipitation):null).filter(Number.isFinite);
    const probabilities=snaps.map(row=>row.precipitationProbability).filter(Number.isFinite);
    const clouds=snaps.map(row=>row.cloudCover).filter(Number.isFinite);
    const winds=snaps.map(row=>row.wind).filter(Number.isFinite);
    const gusts=snaps.map(row=>row.windGust).filter(Number.isFinite);

    return {
      mode,key,timestamp:hourly?key:null,epochMs:hourly?epochMs:null,date:hourly?key.slice(0,10):key,
      temperatureC:hourly?temperatureForecast.central:null,
      tempMinC:hourly?null:minForecast?.central??null,
      tempMaxC:hourly?null:temperatureForecast.central,
      temperatureMinAcrossModels:temperatures.length?Math.min(...temperatures):null,
      temperatureMaxAcrossModels:temperatures.length?Math.max(...temperatures):null,
      precipitationPercent:precipitationForecast.probabilityPercent,
      precipitationSource:precipitationForecast.source,
      precipitationModelCount:precipitationAgreement.count,
      wetModelCount:precipitationAgreement.wetModelCount,
      precipitationMm:precipitationForecast.centralAmountMm,
      precipitationConditionalMm:precipitationForecast.conditionalAmountMm,
      precipitationExpectedMm:precipitationForecast.expectedAmountMm,
      precipitationAgreementPercent:precipitationAgreement.convergencePercent,
      precipitationOccurrenceAgreementPercent:precipitationAgreement.occurrenceConvergencePercent,
      precipitationAmountAgreementPercent:precipitationAgreement.amountConvergencePercent,
      precipitationProbabilityStdDevPercent:precipitationAgreement.probabilityStdDevPercent,
      precipitationHistoricalReliabilityPercent:precipitationForecast.historicalReliabilityPercent??null,
      precipitationMinAcrossModelsMm:precipitationAmounts.length?Math.min(...precipitationAmounts):null,
      precipitationMaxAcrossModelsMm:precipitationAmounts.length?Math.max(...precipitationAmounts):null,
      precipitationExpectedMinAcrossModelsMm:precipitationExpectedAmounts.length?Math.min(...precipitationExpectedAmounts):null,
      precipitationExpectedMaxAcrossModelsMm:precipitationExpectedAmounts.length?Math.max(...precipitationExpectedAmounts):null,
      precipitationProbabilityMin:probabilities.length?Math.min(...probabilities):null,
      precipitationProbabilityMax:probabilities.length?Math.max(...probabilities):null,
      cloudCoverPercent:Number.isFinite(cloudForecast.central)?Math.round(cloudForecast.central):null,
      cloudCoverMinAcrossModels:clouds.length?Math.min(...clouds):null,
      cloudCoverMaxAcrossModels:clouds.length?Math.max(...clouds):null,
      windKmh:windForecast.central,
      windMinAcrossModels:winds.length?Math.min(...winds):null,
      windMaxAcrossModels:winds.length?Math.max(...winds):null,
      windGustKmh:gustForecast.central,
      windGustMinAcrossModels:gusts.length?Math.min(...gusts):null,
      windGustMaxAcrossModels:gusts.length?Math.max(...gusts):null,
      condition,conditionInferred,conditionSource:conditionResolution.conditionSource,
      conditionNativeModelCount:conditionResolution.nativeModelCount,conditionDerivedModelCount:conditionResolution.derivedModelCount,
      modelCount:snaps.length,
      familyCount:Math.max(temperatureAgreement.familyCount,windAgreement.familyCount,precipitationAgreement.familyCount,conditionVote.familyCount),
      consensusPercent,convergencePercent:consensusPercent,
      consensusLevel:Number.isFinite(consensusPercent)?(consensusPercent>=75?'HIGH':consensusPercent>=50?'MEDIUM':'LOW'):null,
      divergenceReasons:[...new Set(divergence)],
      forecastEngine:options?.forecastEngine||DEFAULT_FORECAST_ENGINE,
      engineDetails:{
        temperature:forecastEngineSummary(temperatureForecast),
        tempMin:minForecast?forecastEngineSummary(minForecast):null,
        precipitation:forecastEngineSummary(precipitationForecast),
        cloud:forecastEngineSummary(cloudForecast),
        wind:forecastEngineSummary(windForecast),
        gust:forecastEngineSummary(gustForecast),
      },
    };
  }).filter(point=>point.modelCount>0);
}

export function selectRegularTimelinePoints(points,maxPoints=8,stepHours=3){
  if(!points.length)return [];
  if(points[0].mode!=='HOURLY')return points.slice(0,maxPoints);
  if(points.every(p=>Number.isFinite(p.epochMs))){const by=new Map(points.map(p=>[p.epochMs,p])),start=points[0].epochMs;const chosen=[];for(let slot=0;slot<maxPoints;slot++){const p=by.get(start+slot*stepHours*3600000);if(p)chosen.push(p);}return chosen.length?chosen:points.filter((_,i)=>i%stepHours===0).slice(0,maxPoints);}
  return points.filter((_,i)=>i%stepHours===0).slice(0,maxPoints);
}

export function activeTodayHourlyPoints(points,timezone,now=new Date(),slotDurationMs=3600000){
  const nowMs=now instanceof Date?now.getTime():new Date(now).getTime();if(!Number.isFinite(nowMs))return [];
  const today=cityToday(timezone,now);
  return (points||[]).filter(point=>{
    if(point?.mode!=='HOURLY'||point.date!==today)return false;
    const startMs=Number.isFinite(point.epochMs)?point.epochMs:zonedLocalTimestampEpoch(point.timestamp,timezone,nowMs);
    return Number.isFinite(startMs)&&startMs+slotDurationMs>nowMs;
  });
}

const WET=new Set([CONDITION.DRIZZLE,CONDITION.RAIN,CONDITION.FREEZING_RAIN,CONDITION.SNOW,CONDITION.RAIN_SHOWERS,CONDITION.SNOW_SHOWERS,CONDITION.THUNDERSTORM]);
export function buildScenarios(forecast,maxScenarios=3){
  const timezone=forecast.city?.timezone||forecast.timezone||'UTC',anchor=roundedHourEpoch(timezone),models=[];
  for(const [modelId,s] of Object.entries(forecast.seriesByModel||{})){const axis=hourlyAxis(s,timezone),samples=[];for(let off=0;off<12;off++){const epochMs=anchor+off*3600000,i=axis.indexByEpoch.get(epochMs);if(i==null)continue;const condition=fromWmoCode(s.hourly.weatherCode[i]);samples.push({off,temp:s.hourly.temperature2m[i],precip:s.hourly.precipitation[i],condition:condition===CONDITION.UNKNOWN?null:condition,cloud:s.hourly.cloudCover[i],gust:s.hourly.windGusts10m[i]});}
    if(!samples.length)continue;const wet=samples.filter(x=>isWetPrecipitation(x.precip)||WET.has(x.condition));const precipitation=samples.map(x=>x.precip).filter(Number.isFinite);const totalPrecip=samples.length===12&&precipitation.length===12?precipitation.reduce((a,b)=>a+b,0):null;let kind;
    if(samples.some(x=>x.condition===CONDITION.THUNDERSTORM))kind='THUNDERSTORM';else if(samples.some(x=>x.condition===CONDITION.FREEZING_RAIN))kind='FREEZING_RAIN';else if(samples.some(x=>[CONDITION.SNOW,CONDITION.SNOW_SHOWERS].includes(x.condition)))kind='SNOW';else if(wet.length && ((totalPrecip||0)>=2||wet.length>=3||samples.some(x=>x.condition===CONDITION.RAIN)))kind='RAIN';else if(wet.length)kind='SHOWERS';else {const clouds=samples.map(x=>x.cloud).filter(Number.isFinite).sort((a,b)=>a-b);const med=median(clouds);if(Number.isFinite(med))kind=med<30?'CLEAR':med<70?'VARIABLE_SKY':'OVERCAST';else if(samples.some(x=>[CONDITION.OVERCAST,CONDITION.FOG].includes(x.condition)))kind='OVERCAST';else if(samples.some(x=>x.condition===CONDITION.PARTLY_CLOUDY))kind='VARIABLE_SKY';else if(samples.some(x=>[CONDITION.CLEAR,CONDITION.MAINLY_CLEAR].includes(x.condition)))kind='CLEAR';else kind='DRY_UNSPECIFIED';}
    let timing='NONE';if(wet.length){const offs=wet.map(x=>x.off).sort((a,b)=>a-b);if(offs.length>=8||(offs[0]<=1&&offs.at(-1)>=9))timing='THROUGHOUT';else {const med=offs[Math.floor(offs.length/2)];timing=med<=3?'EARLY':med>=8?'LATE':'MIDDLE';}}
    models.push({modelId,kind,timing,tempMin:minFinite(samples.map(x=>x.temp)),tempMax:maxFinite(samples.map(x=>x.temp)),precipTotal:totalPrecip,cloudMedian:median(samples.map(x=>x.cloud).filter(Number.isFinite)),gustMax:maxFinite(samples.map(x=>x.gust))});
  }
  const groups=new Map();for(const x of models){const key=x.kind+'|'+x.timing;groups.set(key,[...(groups.get(key)||[]),x]);}
  const importance={THUNDERSTORM:8,FREEZING_RAIN:7,SNOW:6,RAIN:5,SHOWERS:4,OVERCAST:3,VARIABLE_SKY:2,CLEAR:1,DRY_UNSPECIFIED:0,OTHER:-1};
  // Scenario ranking uses the same lineage balancing as the central forecast: several
  // sibling configurations share one family vote instead of multiplying influence.
  const scenarioBalance=familyBalancedWeights(models.map(x=>x.modelId)),totalVoteWeight=Object.values(scenarioBalance.weights).reduce((a,b)=>a+b,0)||1;
  const toScenario=(arr,key)=>{const [kind,timing]=key.split('|'),voteWeight=arr.reduce((sum,x)=>sum+(scenarioBalance.weights[x.modelId]||0),0),familyCount=new Set(arr.map(x=>consensusGroupFor(x.modelId))).size;return {kind,timing,modelIds:arr.map(x=>x.modelId),modelCount:arr.length,totalModelCount:models.length,familyCount,totalFamilyCount:scenarioBalance.familyCount,voteWeight,voteSharePercent:Math.round(voteWeight*100/totalVoteWeight),tempMin:minFinite(arr.map(x=>x.tempMin)),tempMax:maxFinite(arr.map(x=>x.tempMax)),precipMin:minFinite(arr.map(x=>x.precipTotal)),precipMax:maxFinite(arr.map(x=>x.precipTotal)),cloudMin:minFinite(arr.map(x=>x.cloudMedian)),cloudMax:maxFinite(arr.map(x=>x.cloudMedian)),gustMin:minFinite(arr.map(x=>x.gustMax)),gustMax:maxFinite(arr.map(x=>x.gustMax))};};
  const out=[...groups].map(([k,a])=>toScenario(a,k)).sort((a,b)=>b.voteWeight-a.voteWeight||(importance[b.kind]-importance[a.kind]));
  const limit=Number.isFinite(maxScenarios)?Math.max(0,Math.trunc(maxScenarios)):out.length;
  // Keep only meteorologically coherent groups. Never merge unrelated leftovers into
  // a synthetic OTHER scenario: min/max ranges across different weather patterns are
  // not a meaningful scenario and can make the remainder appear wetter/warmer than a
  // named group even though no single model group predicts that combined range.
  return out.slice(0,limit);
}

export function aggregateNormals(raw,startDate,endDate){
  const t=raw?.daily?.time||[],max=raw?.daily?.temperature_2m_max||[],min=raw?.daily?.temperature_2m_min||[];const expected=daysBetween(startDate,endDate)+1;const validDates=new Set();const years=new Set();const acc=new Map();let pairs=0;
  t.forEach((date,i)=>{if(typeof date!=='string'||date<startDate||date>endDate)return;validDates.add(date);years.add(date.slice(0,4));const a=max[i],b=min[i];if(!Number.isFinite(a)||!Number.isFinite(b))return;pairs++;const key=date.slice(5);const x=acc.get(key)||{sumMax:0,sumMin:0,n:0};x.sumMax+=a;x.sumMin+=b;x.n++;acc.set(key,x);});
  const complete=years.size>=10&&validDates.size>=Math.ceil(expected*.95)&&pairs>=Math.ceil(expected*.95);const normals=Object.fromEntries([...acc].map(([k,x])=>[k,{tempMaxNormal:x.sumMax/x.n,tempMinNormal:x.sumMin/x.n,count:x.n}]));return {complete,normals};
}


export function windArrow(direction,speed){ if(!Number.isFinite(direction)||!Number.isFinite(speed)||speed<=5)return '';return {deg:(direction+180)%360,char:'↑'}; }

export function dateLabel(date,locale='fr-FR',style='short'){const d=new Date(`${date}T12:00:00Z`),key=`${locale}|${style}`;let f=dateLabelFormatters.get(key);if(!f){f=new Intl.DateTimeFormat(locale,{...(style==='long'?{weekday:'long',day:'numeric',month:'long'}:{weekday:'short',day:'numeric',month:'short'}),timeZone:'UTC'});dateLabelFormatters.set(key,f);}return f.format(d);}
export function timeLabel(localTs){return typeof localTs==='string'&&localTs.includes('T')?localTs.slice(11,16):'—';}
export function relativeAge(iso,locale='fr-FR'){
  if(!iso)return '';
  const parsed=Date.parse(iso);if(!Number.isFinite(parsed))return '';
  const ms=Date.now()-parsed,rtf=new Intl.RelativeTimeFormat(locale,{numeric:'auto'});
  const abs=Math.abs(ms);
  if(abs<60_000)return rtf.format(0,'second');
  if(abs<3_600_000)return rtf.format(-Math.round(ms/60_000),'minute');
  if(abs<86_400_000)return rtf.format(-Math.round(ms/3_600_000),'hour');
  return rtf.format(-Math.round(ms/86_400_000),'day');
}

export function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function minFinite(v){const a=v.filter(Number.isFinite);return a.length?Math.min(...a):null;}function maxFinite(v){const a=v.filter(Number.isFinite);return a.length?Math.max(...a):null;}

/** Agreement/convergence recomputed with optional local reliability weights. Forecast values are never altered here. */
export function weightedDayConfidence(forecast,date,weightsByVariable={}){
  return {...dayConfidence(forecast,date,weightsByVariable),weighted:true};
}
