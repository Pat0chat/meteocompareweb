import { CONDITION, CONDITION_INFO, consensusGroupFor } from './models.js';
import { continuousConsensus, precipitationConsensus, weightedVote, familyBalancedWeights } from './consensus.js';

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
    if (precip >= .1) return freezing ? CONDITION.SNOW_SHOWERS : CONDITION.DRIZZLE;
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
function scoreFromStd(std,tight,wide){ if(std<=tight)return 100;if(std>=wide)return 0;return Math.floor(100*(1-(std-tight)/(wide-tight))); }
function confidenceContinuous(values, tight, wide){ const s=stats(values); if(!s||s.count<2)return null;return {...s, percent:scoreFromStd(s.stdDev,tight,wide), spread:s.max-s.min}; }

function dailyCompletenessEntry(series,index,metric){return series?.daily?.completeness?.[metric]?.[index]||null;}
export function dailyMetricIsComparable(series,index,metric){const status=dailyCompletenessEntry(series,index,metric)?.status;return status==null||status==='FULL'||status==='CURRENT'||status==='UNKNOWN';}
const dailyMetricComparable=dailyMetricIsComparable;

export function dayConfidence(forecast,date,weightsByVariable={}){
  const rows=Object.entries(forecast.seriesByModel||{}).map(([modelId,series])=>{const i=series.daily.dates.indexOf(date);return i<0?null:{modelId,series,i};}).filter(Boolean);
  const entries=(metric,key)=>rows.filter(x=>dailyMetricComparable(x.series,x.i,metric)&&Number.isFinite(x.series.daily[key][x.i])).map(x=>({modelId:x.modelId,value:x.series.daily[key][x.i]}));
  const continuous=(metric,key,weightKey,tight,wide)=>{const c=continuousConsensus(entries(metric,key),weightsByVariable?.[weightKey]||{},tight,wide);return c.stats&&c.familyCount>=2?{...c.stats,central:c.central,percent:c.convergencePercent,spread:c.stats.max-c.stats.min,familyCount:c.familyCount}:null;};
  const tempMax=continuous('temperature','tempMax','temperature',.5,3),tempMin=continuous('temperature','tempMin','temperature',.5,3),windMax=continuous('wind','windSpeedMax','wind',2,12),windGustMax=continuous('wind','windGustsMax','wind',2,12);
  const precipRows=rows.filter(x=>dailyMetricComparable(x.series,x.i,'precipitation')).map(x=>({modelId:x.modelId,amount:x.series.daily.precipitationSum[x.i],probability:x.series.daily.precipitationProbabilityMax[x.i]}));
  const pc=precipitationConsensus(precipRows,{threshold:1,localWeights:weightsByVariable?.precipitation||{},amountTight:1,amountWide:8});
  const precipitation=pc.familyCount>=2?{kind:pc.wetModelCount===0?'NO_RAIN':pc.wetModelCount===pc.count?'RAIN':'DIVIDED',percent:pc.convergencePercent,count:pc.count,familyCount:pc.familyCount,modelsForRain:pc.wetModelCount,modelsAgainstRain:Math.max(0,pc.count-pc.wetModelCount),rainMinMm:pc.minMm,rainMaxMm:pc.maxMm,rainMeanMm:pc.conditionalAmountMm,probabilityPercent:pc.probabilityPercent,conditionalAmountMm:pc.conditionalAmountMm,expectedAmountMm:pc.expectedAmountMm,source:pc.source}:null;
  const scores=[tempMax?.percent,tempMin?.percent,precipitation?.percent,windMax?.percent].filter(Number.isFinite),overall=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
  return {date,tempMax,tempMin,windMax,windGustMax,precipitation,overallPercent:overall,convergencePercent:overall};
}

export function hourlyCondition(series,index){
  if(!series?.hourly||index==null||index<0)return {condition:null,inferred:false};
  const native=fromWmoCode(series.hourly.weatherCode?.[index]);
  if(native&&native!==CONDITION.UNKNOWN)return {condition:native,inferred:false};
  const condition=inferCondition(series.hourly.precipitation?.[index],series.hourly.temperature2m?.[index],series.hourly.cloudCover?.[index]);
  return {condition:condition&&condition!==CONDITION.UNKNOWN?condition:null,inferred:Boolean(condition&&condition!==CONDITION.UNKNOWN)};
}

export function currentConditions(forecast, now=new Date(), options={}) {
  const timezone=forecast.city?.timezone||forecast.timezone||'UTC',target=now.getTime(),rows=[];
  for(const [modelId,series] of Object.entries(forecast.seriesByModel||{})){
    const axis=hourlyAxis(series,timezone);let i=null,best=Infinity;for(const row of axis.rows){const delta=Math.abs(row.epochMs-target);if(delta<best){best=delta;i=row.index;}}if(i==null||best>90*60000)continue;
    const vote=hourlyCondition(series,i);rows.push({modelId,temperature:series.hourly.temperature2m[i],wind:series.hourly.windSpeed10m[i],cloud:series.hourly.cloudCover[i],condition:vote.condition,conditionInferred:vote.inferred});
  }
  const weights=options?.weightsByVariable||{},temp=continuousConsensus(rows.map(x=>({modelId:x.modelId,value:x.temperature})),weights.temperature||{},.5,3),wind=continuousConsensus(rows.map(x=>({modelId:x.modelId,value:x.wind})),weights.wind||{},2,12),cloud=continuousConsensus(rows.map(x=>({modelId:x.modelId,value:x.cloud})),{},10,50);
  const cv=weightedVote(rows.filter(x=>x.condition).map(x=>({modelId:x.modelId,value:x.condition})),{},c=>conditionInfo(c).severity),condition=cv.value,conditionInferred=Boolean(condition)&&!rows.some(x=>x.condition===condition&&!x.conditionInferred);
  return {temperature:temp.central,wind:wind.central,cloudCover:Number.isFinite(cloud.central)?Math.round(cloud.central):null,condition,conditionInferred,modelCount:rows.length,familyCount:Math.max(temp.familyCount,wind.familyCount,cv.familyCount)};
}

export function dailyCloudCoverMean(series,date){
  const vals=[];series.hourly.timestamps.forEach((ts,i)=>{if(ts.slice(0,10)===date){const v=series.hourly.cloudCover[i];if(Number.isInteger(v)&&v>=0&&v<=100)vals.push(v);}});return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null;
}
export function dailyCondition(series,date){
  const di=series.daily.dates.indexOf(date); if(di>=0){const c=fromWmoCode(series.daily.weatherCode[di]);if(c&&c!==CONDITION.UNKNOWN)return {condition:c,inferred:false};}
  const codes=[];let precip=0,pCount=0,minTemp=null,clouds=[];
  series.hourly.timestamps.forEach((ts,i)=>{if(ts.slice(0,10)!==date)return;const c=fromWmoCode(series.hourly.weatherCode[i]);if(c&&c!==CONDITION.UNKNOWN)codes.push(c);const p=series.hourly.precipitation[i];if(Number.isFinite(p)){precip+=p;pCount++;}const t=series.hourly.temperature2m[i];if(Number.isFinite(t))minTemp=minTemp==null?t:Math.min(minTemp,t);const cl=series.hourly.cloudCover[i];if(Number.isFinite(cl))clouds.push(cl);});
  if(codes.length){const counts=new Map();codes.forEach(c=>counts.set(c,(counts.get(c)||0)+1));const max=Math.max(...counts.values());const condition=[...counts].filter(([,v])=>v===max).map(([c])=>c).sort((a,b)=>conditionInfo(b).severity-conditionInfo(a).severity)[0];return {condition,inferred:true};}
  const cond=inferCondition(pCount?precip:null,minTemp,clouds.length?stats(clouds).mean:null);return cond?{condition:cond,inferred:true}:{condition:null,inferred:true};
}


export function hourlyConfidenceBand(forecast,metric='TEMPERATURE', horizonHours=168, now=new Date(), options={}){
  const timezone=forecast.city?.timezone||forecast.timezone||'UTC',series=Object.entries(forecast.seriesByModel||{}),axes=new Map(series.map(([,s])=>[s,hourlyAxis(s,timezone)])),anchor=roundedHourEpoch(timezone,now),weights=options?.weightsByVariable||{};
  const times=[...new Set(series.flatMap(([,s])=>(axes.get(s)?.rows||[]).map(r=>r.epochMs)))].filter(ms=>ms>=anchor).sort((a,b)=>a-b).slice(0,horizonHours),thresholds=metric==='WIND'?[2,12]:[.5,3],weightKey=metric==='WIND'?'wind':metric==='PRECIPITATION'?'precipitation':'temperature';
  return times.map(epochMs=>{
    const rows=[];for(const [modelId,s] of series){const i=axes.get(s)?.indexByEpoch.get(epochMs);if(i==null)continue;rows.push({modelId,timestamp:s.hourly.timestamps[i],temperature:s.hourly.temperature2m[i],wind:s.hourly.windSpeed10m[i],precipitation:s.hourly.precipitation[i],probability:s.hourly.precipitationProbability[i]});}
    if(metric==='PRECIPITATION'){
      const p=precipitationConsensus(rows.map(x=>({modelId:x.modelId,amount:x.precipitation,probability:x.probability})),{threshold:.1,localWeights:weights.precipitation||{},amountTight:1,amountWide:8});if(p.familyCount<2)return null;
      return {timestamp:rows[0]?.timestamp||localHourFromEpoch(epochMs,timezone),epochMs,meanValue:p.centralAmountMm,minValue:p.minMm,maxValue:p.maxMm,stdDev:p.conditionalStdDev,percent:p.convergencePercent,modelCount:p.count,familyCount:p.familyCount,precipitationProbability:p.probabilityPercent,conditionalAmountMm:p.conditionalAmountMm};
    }
    const key=metric==='WIND'?'wind':'temperature',entries=rows.map(x=>({modelId:x.modelId,value:x[key]})),c=continuousConsensus(entries,weights[weightKey]||{},...thresholds);if(c.familyCount<2||!c.stats)return null;
    return {timestamp:rows[0]?.timestamp||localHourFromEpoch(epochMs,timezone),epochMs,meanValue:c.central,minValue:c.stats.min,maxValue:c.stats.max,stdDev:c.stats.stdDev,percent:c.convergencePercent,modelCount:c.count,familyCount:c.familyCount};
  }).filter(Boolean);
}

export function aggregateDay(forecast,date,options={}){
  const data=[];for(const [modelId,s] of Object.entries(forecast.seriesByModel||{})){const i=s.daily.dates.indexOf(date);if(i<0)continue;const dc=dailyCondition(s,date);data.push({modelId,tempMax:s.daily.tempMax[i],tempMin:s.daily.tempMin[i],precip:s.daily.precipitationSum[i],wind:s.daily.windSpeedMax[i],gust:s.daily.windGustsMax[i],direction:s.daily.windDirection10mDominant[i],precipProb:s.daily.precipitationProbabilityMax[i],condition:dc.condition,conditionInferred:dc.inferred,sunrise:s.daily.sunrise[i],sunset:s.daily.sunset[i],comparable:{temperature:dailyMetricComparable(s,i,'temperature'),precipitation:dailyMetricComparable(s,i,'precipitation'),wind:dailyMetricComparable(s,i,'wind'),condition:dailyMetricComparable(s,i,'condition')}});}
  const weights=options?.weightsByVariable||{},metricForKey=k=>['tempMax','tempMin'].includes(k)?'temperature':['wind','gust','direction'].includes(k)?'wind':k==='condition'?'condition':'precipitation';
  const entries=k=>data.filter(x=>x.comparable[metricForKey(k)]&&Number.isFinite(x[k])).map(x=>({modelId:x.modelId,value:x[k]})),central=(k,weightKey,tight,wide)=>continuousConsensus(entries(k),weights?.[weightKey]||{},tight,wide).central,range=k=>{const v=entries(k).map(x=>x.value);return v.length?[Math.min(...v),Math.max(...v)]:[null,null]};
  const precipRows=data.filter(x=>x.comparable.precipitation).map(x=>({modelId:x.modelId,amount:x.precip,probability:x.precipProb})),precip=precipitationConsensus(precipRows,{threshold:1,localWeights:weights.precipitation||{},amountTight:1,amountWide:8});
  const cv=weightedVote(data.filter(x=>x.comparable.condition&&x.condition).map(x=>({modelId:x.modelId,value:x.condition})),{},c=>conditionInfo(c).severity),condition=cv.value,conditionInferred=Boolean(condition)&&!data.some(x=>x.comparable.condition&&x.condition===condition&&!x.conditionInferred);
  return {date,data,tempMax:central('tempMax','temperature',.5,3),tempMin:central('tempMin','temperature',.5,3),precip:precip.centralAmountMm,precipProbability:precip.probabilityPercent,precipConditional:precip.conditionalAmountMm,precipExpected:precip.expectedAmountMm,wind:central('wind','wind',2,12),gust:central('gust','wind',2,12),tempMaxRange:range('tempMax'),tempMinRange:range('tempMin'),precipRange:range('precip'),windRange:range('wind'),gustRange:range('gust'),condition,conditionInferred,confidence:dayConfidence(forecast,date,weights),sunrise:data.find(x=>x.sunrise)?.sunrise||null,sunset:data.find(x=>x.sunset)?.sunset||null,consensusFamilyCount:Math.max(cv.familyCount,precip.familyCount)};
}

export function buildTimelinePoints(forecast, mode='HOURLY', now=new Date(), options={}) {
  const series=Object.entries(forecast.seriesByModel||{});if(!series.length)return [];
  const hourly=mode==='HOURLY',rainThreshold=hourly?.1:1,timezone=forecast.city?.timezone||forecast.timezone||'UTC',axes=hourly?new Map(series.map(([,s])=>[s,hourlyAxis(s,timezone)])):null,weights=options?.weightsByVariable||{};
  const keys=hourly?[...new Map(series.flatMap(([,s])=>(axes.get(s)?.rows||[]).map(row=>[row.epochMs,{timestamp:row.timestamp,epochMs:row.epochMs}]))).values()].sort((a,b)=>a.epochMs-b.epochMs):[...new Set(series.flatMap(([,s])=>s.daily.dates||[]))].sort();
  let selected;if(hourly){const anchor=roundedHourEpoch(timezone,now),end=anchor+24*3600000;selected=keys.filter(x=>x.epochMs>=anchor&&x.epochMs<end);}else{const today=cityToday(timezone,now);selected=keys.filter(d=>d>=today).slice(0,7);}
  return selected.map(slot=>{
    const key=hourly?slot.timestamp:slot,epochMs=hourly?slot.epochMs:null,snaps=[];
    for(const [modelId,s] of series){const i=hourly?(axes.get(s)?.indexByEpoch.get(epochMs)??-1):s.daily.dates.indexOf(key);if(i<0)continue;const tempComparable=hourly||dailyMetricComparable(s,i,'temperature'),precipComparable=hourly||dailyMetricComparable(s,i,'precipitation'),windComparable=hourly||dailyMetricComparable(s,i,'wind'),conditionComparable=hourly||dailyMetricComparable(s,i,'condition');const temperature=hourly?s.hourly.temperature2m[i]:null,tempMin=hourly?null:(tempComparable?s.daily.tempMin[i]:null),tempMax=hourly?null:(tempComparable?s.daily.tempMax[i]:null),precipitation=hourly?s.hourly.precipitation[i]:(precipComparable?s.daily.precipitationSum[i]:null),precipitationProbability=hourly?s.hourly.precipitationProbability[i]:(precipComparable?s.daily.precipitationProbabilityMax[i]:null),cloudCover=hourly?s.hourly.cloudCover[i]:(conditionComparable?dailyCloudCoverMean(s,key):null),wind=hourly?s.hourly.windSpeed10m[i]:(windComparable?s.daily.windSpeedMax[i]:null),windGust=hourly?s.hourly.windGusts10m[i]:(windComparable?s.daily.windGustsMax[i]:null),native=fromWmoCode(hourly?s.hourly.weatherCode[i]:(conditionComparable?s.daily.weatherCode[i]:null)),condition=(native&&native!==CONDITION.UNKNOWN)?native:inferCondition(precipitation,temperature??tempMin,cloudCover),conditionInferred=Boolean(condition&&condition!==CONDITION.UNKNOWN)&&!(native&&native!==CONDITION.UNKNOWN);if([temperature,tempMin,tempMax,precipitation,precipitationProbability,cloudCover,wind,windGust].some(Number.isFinite)||(condition&&condition!==CONDITION.UNKNOWN))snaps.push({modelId,temperature,tempMin,tempMax,precipitation,precipitationProbability,cloudCover,wind,windGust,condition,conditionInferred});}
    const cTemp=continuousConsensus(snaps.map(x=>({modelId:x.modelId,value:hourly?x.temperature:x.tempMax})),weights.temperature||{},hourly?.5:.5,hourly?3:3),cMin=hourly?null:continuousConsensus(snaps.map(x=>({modelId:x.modelId,value:x.tempMin})),weights.temperature||{},.5,3),cWind=continuousConsensus(snaps.map(x=>({modelId:x.modelId,value:x.wind})),weights.wind||{},2,12),cGust=continuousConsensus(snaps.map(x=>({modelId:x.modelId,value:x.windGust})),weights.wind||{},2,12),cCloud=continuousConsensus(snaps.map(x=>({modelId:x.modelId,value:x.cloudCover})),{},10,50),pc=precipitationConsensus(snaps.map(x=>({modelId:x.modelId,amount:x.precipitation,probability:x.precipitationProbability})),{threshold:rainThreshold,localWeights:weights.precipitation||{},amountTight:hourly?.5:1,amountWide:hourly?4:8}),cv=weightedVote(snaps.filter(x=>x.condition&&x.condition!==CONDITION.UNKNOWN).map(x=>({modelId:x.modelId,value:x.condition})),{},c=>conditionInfo(c).severity),condition=cv.value,conditionInferred=Boolean(condition)&&!snaps.some(x=>x.condition===condition&&!x.conditionInferred),metricScores=[],divergence=[];
    const push=(name,c)=>{if(Number.isFinite(c)){metricScores.push(c);if(c<50)divergence.push(name);}},tempConvergences=[cTemp.convergencePercent,cMin?.convergencePercent].filter(Number.isFinite),tempConvergence=hourly?cTemp.convergencePercent:(tempConvergences.length?tempConvergences.reduce((a,b)=>a+b,0)/tempConvergences.length:null);push('TEMPERATURE',tempConvergence);push('WIND',cWind.convergencePercent);push('PRECIPITATION',pc.convergencePercent);push('CONDITION',cv.percent);
    const consensusPercent=metricScores.length?Math.round(metricScores.reduce((a,b)=>a+b,0)/metricScores.length):null,temps=snaps.map(x=>hourly?x.temperature:x.tempMax).filter(Number.isFinite),mins=snaps.map(x=>x.tempMin).filter(Number.isFinite),prec=snaps.map(x=>x.precipitation).filter(Number.isFinite),probs=snaps.map(x=>x.precipitationProbability).filter(Number.isFinite),clouds=snaps.map(x=>x.cloudCover).filter(Number.isFinite),winds=snaps.map(x=>x.wind).filter(Number.isFinite);
    return {mode,key,timestamp:hourly?key:null,epochMs:hourly?epochMs:null,date:hourly?key.slice(0,10):key,temperatureC:hourly?cTemp.central:null,tempMinC:hourly?null:cMin?.central??null,tempMaxC:hourly?null:cTemp.central,temperatureMinAcrossModels:temps.length?Math.min(...temps):null,temperatureMaxAcrossModels:temps.length?Math.max(...temps):null,precipitationPercent:pc.probabilityPercent,precipitationSource:pc.source,precipitationModelCount:pc.count,wetModelCount:pc.wetModelCount,precipitationMm:pc.centralAmountMm,precipitationConditionalMm:pc.conditionalAmountMm,precipitationExpectedMm:pc.expectedAmountMm,precipitationMinAcrossModelsMm:prec.length?Math.min(...prec):null,precipitationMaxAcrossModelsMm:prec.length?Math.max(...prec):null,precipitationProbabilityMin:probs.length?Math.min(...probs):null,precipitationProbabilityMax:probs.length?Math.max(...probs):null,cloudCoverPercent:Number.isFinite(cCloud.central)?Math.round(cCloud.central):null,cloudCoverMinAcrossModels:clouds.length?Math.min(...clouds):null,cloudCoverMaxAcrossModels:clouds.length?Math.max(...clouds):null,windKmh:cWind.central,windMinAcrossModels:winds.length?Math.min(...winds):null,windMaxAcrossModels:winds.length?Math.max(...winds):null,windGustKmh:cGust.central,condition,conditionInferred,modelCount:snaps.length,familyCount:Math.max(cTemp.familyCount,cWind.familyCount,pc.familyCount,cv.familyCount),consensusPercent,convergencePercent:consensusPercent,consensusLevel:Number.isFinite(consensusPercent)?(consensusPercent>=75?'HIGH':consensusPercent>=50?'MEDIUM':'LOW'):null,divergenceReasons:[...new Set(divergence)]};
  }).filter(x=>x.modelCount>0);
}

export function selectRegularTimelinePoints(points,maxPoints=8,stepHours=3){
  if(!points.length)return [];
  if(points[0].mode!=='HOURLY')return points.slice(0,maxPoints);
  if(points.every(p=>Number.isFinite(p.epochMs))){const by=new Map(points.map(p=>[p.epochMs,p])),start=points[0].epochMs;const chosen=[];for(let slot=0;slot<maxPoints;slot++){const p=by.get(start+slot*stepHours*3600000);if(p)chosen.push(p);}return chosen.length?chosen:points.filter((_,i)=>i%stepHours===0).slice(0,maxPoints);}
  return points.filter((_,i)=>i%stepHours===0).slice(0,maxPoints);
}

export function homeHeatmap(forecast,hours=12,options={}){
  const timezone=forecast.city?.timezone||forecast.timezone||'UTC',anchor=roundedHourEpoch(timezone),result=[],series=Object.entries(forecast.seriesByModel||{}).map(([modelId,s])=>({modelId,s,axis:hourlyAxis(s,timezone)})),weights=options?.weightsByVariable||{};
  for(let off=0;off<hours;off++){const epochMs=anchor+off*3600000,target=localHourFromEpoch(epochMs,timezone),rows=[];for(const {modelId,s,axis} of series){const i=axis.indexByEpoch.get(epochMs);if(i==null)continue;rows.push({modelId,temp:s.hourly.temperature2m[i],precipitation:s.hourly.precipitation[i],probability:s.hourly.precipitationProbability[i]});}const temp=continuousConsensus(rows.map(x=>({modelId:x.modelId,value:x.temp})),weights.temperature||{},.5,3),pc=precipitationConsensus(rows.map(x=>({modelId:x.modelId,amount:x.precipitation,probability:x.probability})),{threshold:.1,localWeights:weights.precipitation||{},amountTight:.5,amountWide:4});result.push({timestamp:target,epochMs,temp:temp.central,precipProbability:pc.probabilityPercent});}return result;
}

const WET=new Set([CONDITION.DRIZZLE,CONDITION.RAIN,CONDITION.FREEZING_RAIN,CONDITION.SNOW,CONDITION.RAIN_SHOWERS,CONDITION.SNOW_SHOWERS,CONDITION.THUNDERSTORM]);
export function buildScenarios(forecast,maxScenarios=3){
  const timezone=forecast.city?.timezone||forecast.timezone||'UTC',anchor=roundedHourEpoch(timezone),models=[];
  for(const [modelId,s] of Object.entries(forecast.seriesByModel||{})){const axis=hourlyAxis(s,timezone),samples=[];for(let off=0;off<12;off++){const epochMs=anchor+off*3600000,i=axis.indexByEpoch.get(epochMs);if(i==null)continue;const condition=fromWmoCode(s.hourly.weatherCode[i]);samples.push({off,temp:s.hourly.temperature2m[i],precip:s.hourly.precipitation[i],condition:condition===CONDITION.UNKNOWN?null:condition,cloud:s.hourly.cloudCover[i],gust:s.hourly.windGusts10m[i]});}
    if(!samples.length)continue;const wet=samples.filter(x=>(x.precip||0)>=.1||WET.has(x.condition));const precipitation=samples.map(x=>x.precip).filter(Number.isFinite);const totalPrecip=samples.length===12&&precipitation.length===12?precipitation.reduce((a,b)=>a+b,0):null;let kind;
    if(samples.some(x=>x.condition===CONDITION.THUNDERSTORM))kind='THUNDERSTORM';else if(samples.some(x=>x.condition===CONDITION.FREEZING_RAIN))kind='FREEZING_RAIN';else if(samples.some(x=>[CONDITION.SNOW,CONDITION.SNOW_SHOWERS].includes(x.condition)))kind='SNOW';else if(wet.length && ((totalPrecip||0)>=2||wet.length>=3||samples.some(x=>x.condition===CONDITION.RAIN)))kind='RAIN';else if(wet.length)kind='SHOWERS';else {const clouds=samples.map(x=>x.cloud).filter(Number.isFinite).sort((a,b)=>a-b);const med=median(clouds);if(Number.isFinite(med))kind=med<30?'CLEAR':med<70?'VARIABLE_SKY':'OVERCAST';else if(samples.some(x=>[CONDITION.OVERCAST,CONDITION.FOG].includes(x.condition)))kind='OVERCAST';else if(samples.some(x=>x.condition===CONDITION.PARTLY_CLOUDY))kind='VARIABLE_SKY';else if(samples.some(x=>[CONDITION.CLEAR,CONDITION.MAINLY_CLEAR].includes(x.condition)))kind='CLEAR';else kind='DRY_UNSPECIFIED';}
    let timing='NONE';if(wet.length){const offs=wet.map(x=>x.off).sort((a,b)=>a-b);if(offs.length>=8||(offs[0]<=1&&offs.at(-1)>=9))timing='THROUGHOUT';else {const med=offs[Math.floor(offs.length/2)];timing=med<=3?'EARLY':med>=8?'LATE':'MIDDLE';}}
    models.push({modelId,kind,timing,tempMin:minFinite(samples.map(x=>x.temp)),tempMax:maxFinite(samples.map(x=>x.temp)),precipTotal:totalPrecip,cloudMedian:median(samples.map(x=>x.cloud).filter(Number.isFinite)),gustMax:maxFinite(samples.map(x=>x.gust))});
  }
  const groups=new Map();for(const x of models){const key=x.kind+'|'+x.timing;groups.set(key,[...(groups.get(key)||[]),x]);}
  const importance={THUNDERSTORM:8,FREEZING_RAIN:7,SNOW:6,RAIN:5,SHOWERS:4,OVERCAST:3,VARIABLE_SKY:2,CLEAR:1,DRY_UNSPECIFIED:0,OTHER:-1};
  // Scenario ranking uses the same lineage balancing as the central forecast: several
  // sibling configurations share one family vote instead of multiplying influence.
  const scenarioBalance=familyBalancedWeights(models.map(x=>x.modelId)),totalVoteWeight=Object.values(scenarioBalance.weights).reduce((a,b)=>a+b,0)||1;
  const toScenario=(arr,key)=>{const [kind,timing]=key.split('|'),voteWeight=arr.reduce((sum,x)=>sum+(scenarioBalance.weights[x.modelId]||0),0),familyCount=new Set(arr.map(x=>consensusGroupFor(x.modelId))).size;return {kind,timing,modelCount:arr.length,totalModelCount:models.length,familyCount,totalFamilyCount:scenarioBalance.familyCount,voteWeight,voteSharePercent:Math.round(voteWeight*100/totalVoteWeight),tempMin:minFinite(arr.map(x=>x.tempMin)),tempMax:maxFinite(arr.map(x=>x.tempMax)),precipMin:minFinite(arr.map(x=>x.precipTotal)),precipMax:maxFinite(arr.map(x=>x.precipTotal)),cloudMin:minFinite(arr.map(x=>x.cloudMedian)),cloudMax:maxFinite(arr.map(x=>x.cloudMedian)),gustMin:minFinite(arr.map(x=>x.gustMax)),gustMax:maxFinite(arr.map(x=>x.gustMax))};};
  let out=[...groups].map(([k,a])=>toScenario(a,k)).sort((a,b)=>b.voteWeight-a.voteWeight||(importance[b.kind]-importance[a.kind]));if(out.length<=maxScenarios)return out;if(maxScenarios===1)return [{...toScenario(models,'OTHER|NONE'),kind:'OTHER',timing:'NONE'}];const kept=out.slice(0,maxScenarios-1);const keepKeys=new Set(kept.map(x=>x.kind+'|'+x.timing));const rem=models.filter(x=>!keepKeys.has(x.kind+'|'+x.timing));return [...kept,{...toScenario(rem,'OTHER|NONE'),kind:'OTHER',timing:'NONE'}];
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
