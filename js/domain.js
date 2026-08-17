import { CONDITION, CONDITION_INFO, getModel } from './models.js';

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
  const parts = new Intl.DateTimeFormat('en-CA',{ timeZone:tz, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
export function cityToday(timezone, date=new Date()) {
  const p=zonedParts(date,timezone); return `${p.year}-${p.month}-${p.day}`;
}
export function cityNowLocal(timezone, date=new Date()) {
  const p=zonedParts(date,timezone); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function safeTimezone(tz) {
  try { new Intl.DateTimeFormat('en',{timeZone:tz||'UTC'}).format(); return tz||'UTC'; } catch { return 'UTC'; }
}
function localEpoch(s) { if(typeof s!=='string') return NaN; const m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/); if(!m)return NaN; return Date.UTC(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0)); }
export function addDays(dateStr, days){ const d=new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function daysBetween(a,b){ return Math.round((localEpoch(b)-localEpoch(a))/86400000); }

export function nearestIndex(timestamps, targetLocal, maxMinutes=90) {
  const target=localEpoch(targetLocal); if(!Number.isFinite(target)||!timestamps?.length)return null;
  let best=-1,bestD=Infinity;
  timestamps.forEach((ts,i)=>{const x=localEpoch(ts);if(Number.isFinite(x)){const d=Math.abs(x-target);if(d<bestD){bestD=d;best=i;}}});
  return best>=0 && bestD <= maxMinutes*60000 ? best : null;
}
export function roundedHourLocal(timezone, now=new Date()) {
  const p=zonedParts(now,timezone); let y=+p.year,m=+p.month,d=+p.day,h=+p.hour; if(+p.minute>30){ const q=new Date(Date.UTC(y,m-1,d,h)+3600000); y=q.getUTCFullYear();m=q.getUTCMonth()+1;d=q.getUTCDate();h=q.getUTCHours(); }
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00`;
}

function stats(values) {
  const a=values.filter(Number.isFinite); if(!a.length)return null; const mean=a.reduce((s,v)=>s+v,0)/a.length; const variance=a.reduce((s,v)=>s+(v-mean)**2,0)/a.length;
  return { mean, stdDev:Math.sqrt(variance), min:Math.min(...a), max:Math.max(...a), count:a.length };
}
function scoreFromStd(std,tight,wide){ if(std<=tight)return 100;if(std>=wide)return 0;return Math.floor(100*(1-(std-tight)/(wide-tight))); }
function confidenceContinuous(values, tight, wide){ const s=stats(values); if(!s||s.count<2)return null;return {...s, percent:scoreFromStd(s.stdDev,tight,wide), spread:s.max-s.min}; }

export function dayConfidence(forecast,date){
  const rows=Object.values(forecast.seriesByModel||{}).map(series=>{const i=series.daily.dates.indexOf(date);return i<0?null:{series,i};}).filter(Boolean);
  const tempMax=confidenceContinuous(rows.map(x=>x.series.daily.tempMax[x.i]),.5,3);
  const tempMin=confidenceContinuous(rows.map(x=>x.series.daily.tempMin[x.i]),.5,3);
  const windMax=confidenceContinuous(rows.map(x=>x.series.daily.windSpeedMax[x.i]),2,12);
  const windGustMax=confidenceContinuous(rows.map(x=>x.series.daily.windGustsMax[x.i]),2,12);
  const precipitation=precipitationConfidence(rows.map(x=>x.series.daily.precipitationSum[x.i]).filter(Number.isFinite));
  const scores=[tempMax?.percent,tempMin?.percent,precipitation?.percent,windMax?.percent].filter(Number.isFinite);
  return {date,tempMax,tempMin,windMax,windGustMax,precipitation,overallPercent:scores.length?Math.floor(scores.reduce((a,b)=>a+b,0)/scores.length):null};
}
function precipitationConfidence(vals){
  if(!vals.length)return null;const rain=vals.filter(v=>v>=1),dry=vals.filter(v=>v<1);
  if(!rain.length){const max=Math.max(...vals);return {kind:'NO_RAIN',percent:max<.1?100:90,count:vals.length,maxAmountMm:max};}
  if(!dry.length){const s=stats(rain);return {kind:'RAIN',percent:scoreFromStd(s.stdDev,1,8),count:vals.length,minMm:s.min,maxMm:s.max,meanMm:s.mean};}
  const agreement=Math.max(rain.length,dry.length)/vals.length; const s=stats(rain);
  return {kind:'DIVIDED',percent:Math.max(0,Math.min(100,Math.round((agreement-.5)*200))),count:vals.length,modelsForRain:rain.length,modelsAgainstRain:dry.length,rainMinMm:s.min,rainMaxMm:s.max,rainMeanMm:s.mean};
}

export function currentConditions(forecast, now=new Date()) {
  const target=cityNowLocal(forecast.city.timezone,now); const temps=[],winds=[],clouds=[],votes=new Map();
  for(const series of Object.values(forecast.seriesByModel||{})){
    const i=nearestIndex(series.hourly.timestamps,target,90);if(i==null)continue;
    const t=series.hourly.temperature2m[i],w=series.hourly.windSpeed10m[i],c=series.hourly.cloudCover[i],p=series.hourly.precipitation[i];
    if(Number.isFinite(t))temps.push(t);if(Number.isFinite(w))winds.push(w);if(Number.isFinite(c))clouds.push(c);
    const cond=(fromWmoCode(series.hourly.weatherCode[i])||inferCondition(p,t,c)); if(cond&&cond!==CONDITION.UNKNOWN)votes.set(cond,(votes.get(cond)||0)+1);
  }
  let condition=null;if(votes.size){const max=Math.max(...votes.values());condition=[...votes].filter(([,v])=>v===max).map(([k])=>k).sort((a,b)=>conditionInfo(b).severity-conditionInfo(a).severity)[0];}
  return {temperature:stats(temps)?.mean??null,wind:stats(winds)?.mean??null,cloudCover:clouds.length?Math.round(stats(clouds).mean):null,condition,modelCount:Object.keys(forecast.seriesByModel||{}).length};
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

export function dailyMatrix(forecast){
  const today=cityToday(forecast.city.timezone); const dates=[...new Set(Object.values(forecast.seriesByModel||{}).flatMap(s=>s.daily.dates))].filter(d=>d>=today).sort();
  return dates.map(date=>({date,models:Object.fromEntries(Object.entries(forecast.seriesByModel||{}).map(([modelId,s])=>{const x=dailyCondition(s,date);const i=s.daily.dates.indexOf(date);return [modelId,{...x,precipProbabilityMax:i>=0?s.daily.precipitationProbabilityMax[i]:null,cloudCoverMean:dailyCloudCoverMean(s,date)}];}))}));
}

export function hourlyConfidenceBand(forecast,metric='TEMPERATURE', horizonHours=168){
  const extractor= metric==='PRECIPITATION' ? s=>s.hourly.precipitation : metric==='WIND' ? s=>s.hourly.windSpeed10m : s=>s.hourly.temperature2m;
  const thresholds=metric==='PRECIPITATION'?[1,8]:metric==='WIND'?[2,12]:[.5,3];
  const maps=Object.values(forecast.seriesByModel||{}).map(s=>{const m=new Map();const v=extractor(s);s.hourly.timestamps.forEach((ts,i)=>{if(Number.isFinite(v[i]))m.set(ts,v[i]);});return m;});
  const times=[...new Set(maps.flatMap(m=>[...m.keys()]))].sort().slice(0,horizonHours);return times.map(ts=>{const vals=maps.map(m=>m.get(ts)).filter(Number.isFinite);if(vals.length<2)return null;const s=stats(vals);return {timestamp:ts,meanValue:s.mean,minValue:s.min,maxValue:s.max,stdDev:s.stdDev,percent:scoreFromStd(s.stdDev,...thresholds),modelCount:s.count};}).filter(Boolean);
}

export function aggregateDay(forecast,date){
  const data=[];for(const [modelId,s] of Object.entries(forecast.seriesByModel||{})){const i=s.daily.dates.indexOf(date);if(i<0)continue;data.push({modelId,tempMax:s.daily.tempMax[i],tempMin:s.daily.tempMin[i],precip:s.daily.precipitationSum[i],wind:s.daily.windSpeedMax[i],gust:s.daily.windGustsMax[i],direction:s.daily.windDirection10mDominant[i],precipProb:s.daily.precipitationProbabilityMax[i],condition:dailyCondition(s,date).condition,sunrise:s.daily.sunrise[i],sunset:s.daily.sunset[i]});}
  const mean=k=>stats(data.map(x=>x[k]))?.mean??null; const range=k=>{const s=stats(data.map(x=>x[k]));return s?[s.min,s.max]:[null,null]};
  const votes=data.map(x=>x.condition).filter(Boolean);let condition=null;if(votes.length){const c=new Map();votes.forEach(v=>c.set(v,(c.get(v)||0)+1));const max=Math.max(...c.values());condition=[...c].filter(([,v])=>v===max).map(([k])=>k).sort((a,b)=>conditionInfo(b).severity-conditionInfo(a).severity)[0];}
  return {date,data,tempMax:mean('tempMax'),tempMin:mean('tempMin'),precip:mean('precip'),wind:mean('wind'),gust:mean('gust'),tempMaxRange:range('tempMax'),tempMinRange:range('tempMin'),precipRange:range('precip'),windRange:range('wind'),gustRange:range('gust'),condition,confidence:dayConfidence(forecast,date),sunrise:data.find(x=>x.sunrise)?.sunrise||null,sunset:data.find(x=>x.sunset)?.sunset||null};
}

export function homeHeatmap(forecast,hours=12){
  const anchor=roundedHourLocal(forecast.city.timezone);const result=[];
  for(let off=0;off<hours;off++){const d=new Date(localEpoch(anchor)+off*3600000);const target=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}:00`;const temps=[],probs=[];for(const s of Object.values(forecast.seriesByModel||{})){const i=nearestIndex(s.hourly.timestamps,target,30);if(i==null)continue;if(Number.isFinite(s.hourly.temperature2m[i]))temps.push(s.hourly.temperature2m[i]);if(Number.isFinite(s.hourly.precipitationProbability[i]))probs.push(s.hourly.precipitationProbability[i]);}result.push({timestamp:target,temp:stats(temps)?.mean??null,precipProbability:probs.length?Math.round(stats(probs).mean):null});}return result;
}

const WET=new Set([CONDITION.DRIZZLE,CONDITION.RAIN,CONDITION.FREEZING_RAIN,CONDITION.SNOW,CONDITION.RAIN_SHOWERS,CONDITION.SNOW_SHOWERS,CONDITION.THUNDERSTORM]);
export function buildScenarios(forecast,maxScenarios=3){
  const anchor=roundedHourLocal(forecast.city.timezone);const models=[];
  for(const [modelId,s] of Object.entries(forecast.seriesByModel||{})){const samples=[];for(let off=0;off<12;off++){const d=new Date(localEpoch(anchor)+off*3600000);const target=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}:00`;const i=nearestIndex(s.hourly.timestamps,target,30);if(i==null)continue;const condition=fromWmoCode(s.hourly.weatherCode[i]);samples.push({off,temp:s.hourly.temperature2m[i],precip:s.hourly.precipitation[i],condition:condition===CONDITION.UNKNOWN?null:condition,cloud:s.hourly.cloudCover[i],gust:s.hourly.windGusts10m[i]});}
    if(!samples.length)continue;const wet=samples.filter(x=>(x.precip||0)>=.1||WET.has(x.condition));const precipitation=samples.map(x=>x.precip).filter(Number.isFinite);const totalPrecip=samples.length===12&&precipitation.length===12?precipitation.reduce((a,b)=>a+b,0):null;let kind;
    if(samples.some(x=>x.condition===CONDITION.THUNDERSTORM))kind='THUNDERSTORM';else if(samples.some(x=>x.condition===CONDITION.FREEZING_RAIN))kind='FREEZING_RAIN';else if(samples.some(x=>[CONDITION.SNOW,CONDITION.SNOW_SHOWERS].includes(x.condition)))kind='SNOW';else if(wet.length && ((totalPrecip||0)>=2||wet.length>=3||samples.some(x=>x.condition===CONDITION.RAIN)))kind='RAIN';else if(wet.length)kind='SHOWERS';else {const clouds=samples.map(x=>x.cloud).filter(Number.isFinite).sort((a,b)=>a-b);const med=median(clouds);if(Number.isFinite(med))kind=med<30?'CLEAR':med<70?'VARIABLE_SKY':'OVERCAST';else if(samples.some(x=>[CONDITION.OVERCAST,CONDITION.FOG].includes(x.condition)))kind='OVERCAST';else if(samples.some(x=>x.condition===CONDITION.PARTLY_CLOUDY))kind='VARIABLE_SKY';else if(samples.some(x=>[CONDITION.CLEAR,CONDITION.MAINLY_CLEAR].includes(x.condition)))kind='CLEAR';else kind='DRY_UNSPECIFIED';}
    let timing='NONE';if(wet.length){const offs=wet.map(x=>x.off).sort((a,b)=>a-b);if(offs.length>=8||(offs[0]<=1&&offs.at(-1)>=9))timing='THROUGHOUT';else {const med=offs[Math.floor(offs.length/2)];timing=med<=3?'EARLY':med>=8?'LATE':'MIDDLE';}}
    models.push({modelId,kind,timing,tempMin:minFinite(samples.map(x=>x.temp)),tempMax:maxFinite(samples.map(x=>x.temp)),precipTotal:totalPrecip,cloudMedian:median(samples.map(x=>x.cloud).filter(Number.isFinite)),gustMax:maxFinite(samples.map(x=>x.gust))});
  }
  const groups=new Map();for(const x of models){const key=x.kind+'|'+x.timing;groups.set(key,[...(groups.get(key)||[]),x]);}
  const importance={THUNDERSTORM:8,FREEZING_RAIN:7,SNOW:6,RAIN:5,SHOWERS:4,OVERCAST:3,VARIABLE_SKY:2,CLEAR:1,DRY_UNSPECIFIED:0,OTHER:-1};
  const toScenario=(arr,key)=>{const [kind,timing]=key.split('|');return {kind,timing,modelCount:arr.length,totalModelCount:models.length,tempMin:minFinite(arr.map(x=>x.tempMin)),tempMax:maxFinite(arr.map(x=>x.tempMax)),precipMin:minFinite(arr.map(x=>x.precipTotal)),precipMax:maxFinite(arr.map(x=>x.precipTotal)),cloudMin:minFinite(arr.map(x=>x.cloudMedian)),cloudMax:maxFinite(arr.map(x=>x.cloudMedian)),gustMin:minFinite(arr.map(x=>x.gustMax)),gustMax:maxFinite(arr.map(x=>x.gustMax))};};
  let out=[...groups].map(([k,a])=>toScenario(a,k)).sort((a,b)=>b.modelCount-a.modelCount||(importance[b.kind]-importance[a.kind]));if(out.length<=maxScenarios)return out;if(maxScenarios===1)return [{...toScenario(models,'OTHER|NONE'),kind:'OTHER',timing:'NONE'}];const kept=out.slice(0,maxScenarios-1);const keepKeys=new Set(kept.map(x=>x.kind+'|'+x.timing));const rem=models.filter(x=>!keepKeys.has(x.kind+'|'+x.timing));return [...kept,{...toScenario(rem,'OTHER|NONE'),kind:'OTHER',timing:'NONE'}];
}

export function aggregateNormals(raw,startDate,endDate){
  const t=raw?.daily?.time||[],max=raw?.daily?.temperature_2m_max||[],min=raw?.daily?.temperature_2m_min||[];const expected=daysBetween(startDate,endDate)+1;const validDates=new Set();const years=new Set();const acc=new Map();let pairs=0;
  t.forEach((date,i)=>{if(typeof date!=='string'||date<startDate||date>endDate)return;validDates.add(date);years.add(date.slice(0,4));const a=max[i],b=min[i];if(!Number.isFinite(a)||!Number.isFinite(b))return;pairs++;const key=date.slice(5);const x=acc.get(key)||{sumMax:0,sumMin:0,n:0};x.sumMax+=a;x.sumMin+=b;x.n++;acc.set(key,x);});
  const complete=years.size>=10&&validDates.size>=Math.ceil(expected*.95)&&pairs>=Math.ceil(expected*.95);const normals=Object.fromEntries([...acc].map(([k,x])=>[k,{tempMaxNormal:x.sumMax/x.n,tempMinNormal:x.sumMin/x.n,count:x.n}]));return {complete,normals};
}

export function normalizePreviousRuns(raw,city,models,startDate,endDate){
  const h=raw?.hourly||{};const timeline=(h.time||[]).map((ts,i)=>({ts,i,date:typeof ts==='string'?ts.slice(0,10):''})).filter(x=>x.date>=startDate&&x.date<=endDate);const expected=timeline.reduce((m,x)=>(m[x.date]=(m[x.date]||0)+1,m),{});const records=[];const single=models.length===1;
  const lookup=(base,model)=>{const lead=`${base}_previous_day1`;const keys=[];for(const key of [model.apiKey,...model.aliases]){keys.push(`${lead}_${key}`,`${base}_${key}_previous_day1`);}if(single)keys.push(lead);for(const k of keys)if(Array.isArray(h[k]))return h[k];return [];};
  for(const model of models){const series={TEMPERATURE:lookup('temperature_2m',model),PRECIPITATION:lookup('precipitation',model),WIND_SPEED:lookup('wind_speed_10m',model)};const byDate=new Map();for(const x of timeline){let a=byDate.get(x.date);if(!a){a={TEMPERATURE:[],PRECIPITATION:[],WIND_SPEED:[]};byDate.set(x.date,a);}for(const v of Object.keys(series)){const z=series[v][x.i];if(Number.isFinite(z)&&(v==='TEMPERATURE'||z>=0))a[v].push(z);}}
    for(const [date,a] of byDate){const n=expected[date];if(n<23||n>25)continue;const values={TEMPERATURE:a.TEMPERATURE.length===n?Math.max(...a.TEMPERATURE):null,PRECIPITATION:a.PRECIPITATION.length===n?a.PRECIPITATION.reduce((s,v)=>s+v,0):null,WIND_SPEED:a.WIND_SPEED.length===n?Math.max(...a.WIND_SPEED):null};for(const [variable,value] of Object.entries(values))if(Number.isFinite(value))records.push({modelId:model.id,variable,targetDate:date,issuedDate:addDays(date,-1),value});}
  }
  return records;
}

export function normalizeBiasObservations(raw,startDate,endDate){
  const d=raw?.daily||{};const out=[];(d.time||[]).forEach((date,i)=>{if(date<startDate||date>endDate)return;const vals={TEMPERATURE:d.temperature_2m_max?.[i],PRECIPITATION:d.precipitation_sum?.[i],WIND_SPEED:d.wind_speed_10m_max?.[i]};for(const [variable,value] of Object.entries(vals))if(Number.isFinite(value)&&(variable==='TEMPERATURE'||value>=0))out.push({variable,targetDate:date,value});});return out;
}

export function computeBiases(biasData,today,windowDays=30){
  const start=addDays(today,-windowDays);const obs=new Map((biasData.observations||[]).map(x=>[`${x.variable}|${x.targetDate}`,x.value]));const grouped=new Map();for(const f of biasData.forecasts||[]){if(f.targetDate<start||f.targetDate>=today)continue;const o=obs.get(`${f.variable}|${f.targetDate}`);if(!Number.isFinite(o))continue;const key=`${f.modelId}|${f.variable}`;const m=grouped.get(key)||new Map();m.set(f.targetDate,f.value-o);grouped.set(key,m);}const out={};for(const [key,map] of grouped){const vals=[...map.values()];const [modelId,variable]=key.split('|');out[modelId]||={};if(vals.length<14){out[modelId][variable]={sampleSize:vals.length,ready:false};continue;}const mean=vals.reduce((a,b)=>a+b,0)/vals.length;const sd=vals.length>1?Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/(vals.length-1)):0;out[modelId][variable]={sampleSize:vals.length,ready:true,meanBias:mean,stdDev:sd,windowDays};}return out;
}

export function buildEvolution(forecast,storedSnapshots){
  const now=Date.now();const targets=[24,48,72];const chosen=targets.map(h=>storedSnapshots.map(s=>({...s,ageHours:Math.round((now-s.capturedAt)/3600000)})).filter(s=>s.ageHours>=Math.max(3,h-10)&&s.ageHours<=h+12).sort((a,b)=>Math.abs(a.ageHours-h)-Math.abs(b.ageHours-h))[0]).filter(Boolean);const today=cityToday(forecast.city.timezone);const dates=[...new Set(Object.values(forecast.seriesByModel||{}).flatMap(s=>s.daily.dates))].filter(d=>d>=today).sort().slice(0,7);const vars=['temperature','precipitation','wind'];const days=[];
  for(const date of dates){const current={};for(const [mid,s] of Object.entries(forecast.seriesByModel||{})){const i=s.daily.dates.indexOf(date);if(i<0)continue;current[mid]={temperature:s.daily.tempMax[i],precipitation:s.daily.precipitationSum[i],wind:s.daily.windSpeedMax[i]};}const variables={};for(const variable of vars){const curr=Object.fromEntries(Object.entries(current).filter(([,v])=>Number.isFinite(v[variable])).map(([m,v])=>[m,v[variable]]));const history=chosen.map(s=>({ageHours:s.ageHours,capturedAt:s.capturedAt,values:Object.fromEntries(Object.entries(s.daily?.[date]||{}).filter(([,v])=>Number.isFinite(v?.[variable])).map(([m,v])=>[m,v[variable]]))})).filter(x=>Object.keys(x.values).length);if(!history.length||Object.keys(curr).length<2)continue;let common=new Set(Object.keys(curr));const retained=[];for(const h of history.sort((a,b)=>a.ageHours-b.ageHours)){const next=new Set(Object.keys(h.values).filter(m=>common.has(m)));if(next.size>=2){common=next;retained.push(h);}}if(!retained.length||common.size<2)continue;const cv=Object.fromEntries([...common].map(m=>[m,curr[m]]));const prev=retained.map(h=>({ageHours:h.ageHours,capturedAt:h.capturedAt,values:Object.fromEntries([...common].map(m=>[m,h.values[m]])),median:median([...common].map(m=>h.values[m]))}));const comparison=prev[0];const deltas=[...common].map(m=>cv[m]-comparison.values[m]);const stable=variable==='temperature'?.5:variable==='precipitation'?1:3;const inc=deltas.filter(x=>x>stable).length,dec=deltas.filter(x=>x<-stable).length,sta=deltas.length-inc-dec,required=Math.ceil(deltas.length*.6);const trend=inc>=required?'INCREASING':dec>=required?'DECREASING':sta>=required?'STABLE':'VOLATILE';variables[variable]={currentMedian:median(Object.values(cv)),previous:prev,trend,medianDelta:median(deltas),medianAbsDelta:median(deltas.map(Math.abs)),comparedModels:deltas.length};}if(Object.keys(variables).length)days.push({date,variables});}
  return {days};
}

export function reliabilityRanking(biases,variable='TEMPERATURE'){
  return Object.entries(biases).map(([modelId,v])=>({modelId,bias:v[variable]})).filter(x=>x.bias?.ready).sort((a,b)=>Math.abs(a.bias.meanBias)-Math.abs(b.bias.meanBias)||a.bias.stdDev-b.bias.stdDev);
}

export function windArrow(direction,speed){ if(!Number.isFinite(direction)||!Number.isFinite(speed)||speed<=5)return '';return {deg:(direction+180)%360,char:'↑'}; }
export function formatWindDirection(direction){if(!Number.isFinite(direction))return '';const dirs=['N','NE','E','SE','S','SO','O','NO'];return dirs[Math.round(direction/45)%8];}

export function dateLabel(date,locale='fr-FR',style='short'){const d=new Date(`${date}T12:00:00Z`);return new Intl.DateTimeFormat(locale, style==='long'?{weekday:'long',day:'numeric',month:'long'}:{weekday:'short',day:'numeric',month:'short'},{timeZone:'UTC'}).format(d);}
export function timeLabel(localTs){return typeof localTs==='string'&&localTs.includes('T')?localTs.slice(11,16):'—';}
export function relativeAge(iso,locale='fr'){if(!iso)return '';const ms=Date.now()-Date.parse(iso);if(ms<0)return locale==='fr'?'à l’instant':'just now';const min=Math.floor(ms/60000);if(min<1)return locale==='fr'?'à l’instant':'just now';if(min<60)return locale==='fr'?`il y a ${min} min`:`${min} min ago`;const h=Math.floor(min/60);if(h<24)return locale==='fr'?`il y a ${h} h`:`${h} h ago`;const d=Math.floor(h/24);return locale==='fr'?`il y a ${d} j`:`${d} d ago`;}

export function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function minFinite(v){const a=v.filter(Number.isFinite);return a.length?Math.min(...a):null;}function maxFinite(v){const a=v.filter(Number.isFinite);return a.length?Math.max(...a):null;}
