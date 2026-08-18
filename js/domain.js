import { CONDITION, CONDITION_INFO, getModel } from './models.js';

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
export function cityNowLocal(timezone, date=new Date()) {
  const p=zonedParts(date,timezone); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function safeTimezone(tz) {
  const candidate=tz||'UTC';
  if(timezoneValidity.has(candidate))return timezoneValidity.get(candidate);
  let valid='UTC';try{new Intl.DateTimeFormat('en',{timeZone:candidate}).format();valid=candidate;}catch{}
  timezoneValidity.set(candidate,valid);return valid;
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

function dailyCompletenessEntry(series,index,metric){return series?.daily?.completeness?.[metric]?.[index]||null;}
function dailyMetricComparable(series,index,metric){const status=dailyCompletenessEntry(series,index,metric)?.status;return status==null||status==='FULL'||status==='CURRENT'||status==='UNKNOWN';}

export function dayConfidence(forecast,date){
  const rows=Object.values(forecast.seriesByModel||{}).map(series=>{const i=series.daily.dates.indexOf(date);return i<0?null:{series,i};}).filter(Boolean);
  const metricValues=(metric,key)=>rows.filter(x=>dailyMetricComparable(x.series,x.i,metric)).map(x=>x.series.daily[key][x.i]);
  const tempMax=confidenceContinuous(metricValues('temperature','tempMax'),.5,3);
  const tempMin=confidenceContinuous(metricValues('temperature','tempMin'),.5,3);
  const windMax=confidenceContinuous(metricValues('wind','windSpeedMax'),2,12);
  const windGustMax=confidenceContinuous(metricValues('wind','windGustsMax'),2,12);
  const precipitation=precipitationConfidence(metricValues('precipitation','precipitationSum').filter(Number.isFinite));
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

export function hourlyCondition(series,index){
  if(!series?.hourly||index==null||index<0)return {condition:null,inferred:false};
  const native=fromWmoCode(series.hourly.weatherCode?.[index]);
  if(native&&native!==CONDITION.UNKNOWN)return {condition:native,inferred:false};
  const condition=inferCondition(series.hourly.precipitation?.[index],series.hourly.temperature2m?.[index],series.hourly.cloudCover?.[index]);
  return {condition:condition&&condition!==CONDITION.UNKNOWN?condition:null,inferred:Boolean(condition&&condition!==CONDITION.UNKNOWN)};
}

export function currentConditions(forecast, now=new Date()) {
  const target=cityNowLocal(forecast.city.timezone,now); const temps=[],winds=[],clouds=[],conditionVotes=[];
  for(const series of Object.values(forecast.seriesByModel||{})){
    const i=nearestIndex(series.hourly.timestamps,target,90);if(i==null)continue;
    const t=series.hourly.temperature2m[i],w=series.hourly.windSpeed10m[i],c=series.hourly.cloudCover[i];
    if(Number.isFinite(t))temps.push(t);if(Number.isFinite(w))winds.push(w);if(Number.isFinite(c))clouds.push(c);
    const vote=hourlyCondition(series,i);if(vote.condition)conditionVotes.push(vote);
  }
  const votes=new Map();conditionVotes.forEach(v=>votes.set(v.condition,(votes.get(v.condition)||0)+1));
  let condition=null;if(votes.size){const max=Math.max(...votes.values());condition=[...votes].filter(([,v])=>v===max).map(([k])=>k).sort((a,b)=>conditionInfo(b).severity-conditionInfo(a).severity)[0];}
  const conditionInferred=Boolean(condition)&&!conditionVotes.some(v=>v.condition===condition&&!v.inferred);
  return {temperature:stats(temps)?.mean??null,wind:stats(winds)?.mean??null,cloudCover:clouds.length?Math.round(stats(clouds).mean):null,condition,conditionInferred,modelCount:Object.keys(forecast.seriesByModel||{}).length};
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

export function hourlyConfidenceBand(forecast,metric='TEMPERATURE', horizonHours=168, now=new Date()){
  const extractor= metric==='PRECIPITATION' ? s=>s.hourly.precipitation : metric==='WIND' ? s=>s.hourly.windSpeed10m : s=>s.hourly.temperature2m;
  const thresholds=metric==='PRECIPITATION'?[1,8]:metric==='WIND'?[2,12]:[.5,3];
  const maps=Object.values(forecast.seriesByModel||{}).map(s=>{const m=new Map();const v=extractor(s);s.hourly.timestamps.forEach((ts,i)=>{if(Number.isFinite(v[i]))m.set(ts,v[i]);});return m;});
  const anchor=localEpoch(roundedHourLocal(forecast.city?.timezone||forecast.timezone||'UTC',now));
  const times=[...new Set(maps.flatMap(m=>[...m.keys()]))].filter(ts=>localEpoch(ts)>=anchor).sort().slice(0,horizonHours);
  return times.map(ts=>{const vals=maps.map(m=>m.get(ts)).filter(Number.isFinite);if(vals.length<2)return null;const s=stats(vals);return {timestamp:ts,meanValue:s.mean,minValue:s.min,maxValue:s.max,stdDev:s.stdDev,percent:scoreFromStd(s.stdDev,...thresholds),modelCount:s.count};}).filter(Boolean);
}

export function aggregateDay(forecast,date){
  const data=[];for(const [modelId,s] of Object.entries(forecast.seriesByModel||{})){const i=s.daily.dates.indexOf(date);if(i<0)continue;const dc=dailyCondition(s,date);data.push({modelId,tempMax:s.daily.tempMax[i],tempMin:s.daily.tempMin[i],precip:s.daily.precipitationSum[i],wind:s.daily.windSpeedMax[i],gust:s.daily.windGustsMax[i],direction:s.daily.windDirection10mDominant[i],precipProb:s.daily.precipitationProbabilityMax[i],condition:dc.condition,conditionInferred:dc.inferred,sunrise:s.daily.sunrise[i],sunset:s.daily.sunset[i],comparable:{temperature:dailyMetricComparable(s,i,'temperature'),precipitation:dailyMetricComparable(s,i,'precipitation'),wind:dailyMetricComparable(s,i,'wind'),condition:dailyMetricComparable(s,i,'condition')}});}
  const metricForKey=k=>['tempMax','tempMin'].includes(k)?'temperature':['wind','gust','direction'].includes(k)?'wind':k==='condition'?'condition':'precipitation';
  const values=k=>data.filter(x=>x.comparable[metricForKey(k)]).map(x=>x[k]);
  const mean=k=>stats(values(k))?.mean??null; const range=k=>{const s=stats(values(k));return s?[s.min,s.max]:[null,null]};
  const votes=data.filter(x=>x.comparable.condition).map(x=>x.condition).filter(Boolean);let condition=null;if(votes.length){const c=new Map();votes.forEach(v=>c.set(v,(c.get(v)||0)+1));const max=Math.max(...c.values());condition=[...c].filter(([,v])=>v===max).map(([k])=>k).sort((a,b)=>conditionInfo(b).severity-conditionInfo(a).severity)[0];}
  const conditionInferred=Boolean(condition)&&!data.some(x=>x.comparable.condition&&x.condition===condition&&!x.conditionInferred);
  return {date,data,tempMax:mean('tempMax'),tempMin:mean('tempMin'),precip:mean('precip'),wind:mean('wind'),gust:mean('gust'),tempMaxRange:range('tempMax'),tempMinRange:range('tempMin'),precipRange:range('precip'),windRange:range('wind'),gustRange:range('gust'),condition,conditionInferred,confidence:dayConfidence(forecast,date),sunrise:data.find(x=>x.sunrise)?.sunrise||null,sunset:data.find(x=>x.sunset)?.sunset||null};
}


export function buildTimelinePoints(forecast, mode='HOURLY', now=new Date()) {
  const series=Object.values(forecast.seriesByModel||{});
  if(!series.length)return [];
  const hourly=mode==='HOURLY';
  const rainThreshold=hourly?.1:.2;
  const keys=hourly
    ? [...new Set(series.flatMap(x=>x.hourly.timestamps||[]))].sort()
    : [...new Set(series.flatMap(x=>x.daily.dates||[]))].sort();
  let selected;
  if(hourly){
    const anchor=roundedHourLocal(forecast.city.timezone,now);
    const end=localEpoch(anchor)+24*3600000;
    selected=keys.filter(ts=>localEpoch(ts)>=localEpoch(anchor)&&localEpoch(ts)<end);
  }else{
    const today=cityToday(forecast.city.timezone,now);
    selected=keys.filter(d=>d>=today).slice(0,7);
  }
  return selected.map(key=>{
    const snaps=[];
    for(const s of series){
      const i=(hourly?s.hourly.timestamps:s.daily.dates).indexOf(key);
      if(i<0)continue;
      const tempComparable=hourly||dailyMetricComparable(s,i,'temperature'),precipComparable=hourly||dailyMetricComparable(s,i,'precipitation'),windComparable=hourly||dailyMetricComparable(s,i,'wind'),conditionComparable=hourly||dailyMetricComparable(s,i,'condition');
      const temperature=hourly?s.hourly.temperature2m[i]:null;
      const tempMin=hourly?null:(tempComparable?s.daily.tempMin[i]:null);
      const tempMax=hourly?null:(tempComparable?s.daily.tempMax[i]:null);
      const precipitation=hourly?s.hourly.precipitation[i]:(precipComparable?s.daily.precipitationSum[i]:null);
      const precipitationProbability=hourly?s.hourly.precipitationProbability[i]:(precipComparable?s.daily.precipitationProbabilityMax[i]:null);
      const cloudCover=hourly?s.hourly.cloudCover[i]:(conditionComparable?dailyCloudCoverMean(s,key):null);
      const wind=hourly?s.hourly.windSpeed10m[i]:(windComparable?s.daily.windSpeedMax[i]:null);
      const windGust=hourly?s.hourly.windGusts10m[i]:(windComparable?s.daily.windGustsMax[i]:null);
      const native=fromWmoCode(hourly?s.hourly.weatherCode[i]:(conditionComparable?s.daily.weatherCode[i]:null));
      const condition=(native&&native!==CONDITION.UNKNOWN)?native:inferCondition(precipitation,temperature??tempMin,cloudCover);
      const conditionInferred=Boolean(condition&&condition!==CONDITION.UNKNOWN)&&!(native&&native!==CONDITION.UNKNOWN);
      if([temperature,tempMin,tempMax,precipitation,precipitationProbability,cloudCover,wind,windGust].some(Number.isFinite)||(condition&&condition!==CONDITION.UNKNOWN))
        snaps.push({temperature,tempMin,tempMax,precipitation,precipitationProbability,cloudCover,wind,windGust,condition,conditionInferred});
    }
    const temps=snaps.map(x=>x.temperature).filter(Number.isFinite), mins=snaps.map(x=>x.tempMin).filter(Number.isFinite), maxs=snaps.map(x=>x.tempMax).filter(Number.isFinite);
    const prec=snaps.map(x=>x.precipitation).filter(Number.isFinite), probs=snaps.map(x=>x.precipitationProbability).filter(Number.isFinite);
    const clouds=snaps.map(x=>x.cloudCover).filter(Number.isFinite), winds=snaps.map(x=>x.wind).filter(Number.isFinite), gusts=snaps.map(x=>x.windGust).filter(Number.isFinite);
    const conditions=snaps.map(x=>x.condition).filter(x=>x&&x!==CONDITION.UNKNOWN);
    const counts=new Map();conditions.forEach(c=>counts.set(c,(counts.get(c)||0)+1));
    const top=counts.size?Math.max(...counts.values()):0;
    const condition=[...counts].filter(([,n])=>n===top).map(([c])=>c).sort((a,b)=>conditionInfo(b).severity-conditionInfo(a).severity)[0]||null;
    const conditionInferred=Boolean(condition)&&!snaps.some(x=>x.condition===condition&&!x.conditionInferred);
    const conditionAgreement=conditions.length>=2?top*100/conditions.length:null;
    const spread=a=>a.length>=2?Math.max(...a)-Math.min(...a):0;
    const wetVotes=prec.filter(v=>v>=rainThreshold).length;
    const wetShare=prec.length>=2?wetVotes*100/prec.length:null;
    const rainCapable=snaps.filter(x=>Number.isFinite(x.precipitationProbability)||Number.isFinite(x.precipitation)).length;
    const minProbCoverage=Math.max(2,Math.ceil(rainCapable/2));
    const robustProb=probs.length>=minProbCoverage;
    const precipPercent=robustProb?Math.round(median(probs)):Number.isFinite(wetShare)?Math.round(wetShare):null;
    const precipSource=robustProb?'PROBABILITY':Number.isFinite(wetShare)?'MODEL_AGREEMENT':null;
    const tempSpread=hourly?spread(temps):Math.max(spread(mins),spread(maxs));
    const windSpread=spread(winds),probSpread=spread(probs);
    const splitRain=Number.isFinite(wetShare)&&wetShare>=30&&wetShare<=70;
    const rainDivergent=robustProb?probSpread>50:splitRain;
    const score=(sp,z)=>Math.max(0,Math.min(100,100-(sp/z*100)));
    const metricScores=[];const divergence=[];
    const tempCount=hourly?temps.length:Math.max(mins.length,maxs.length);
    if(tempCount>=2){const x=score(tempSpread,hourly?8:10);metricScores.push(x);if(tempSpread>(hourly?4:5))divergence.push('TEMPERATURE');}
    if(winds.length>=2){const x=score(windSpread,40);metricScores.push(x);if(windSpread>20)divergence.push('WIND');}
    if(robustProb){const x=Math.max(0,Math.min(100,100-probSpread));metricScores.push(x);if(rainDivergent)divergence.push('PRECIPITATION');}
    else if(Number.isFinite(wetShare)){metricScores.push(Math.max(wetShare,100-wetShare));if(rainDivergent)divergence.push('PRECIPITATION');}
    if(Number.isFinite(conditionAgreement)){metricScores.push(conditionAgreement);if(conditionAgreement<60)divergence.push('CONDITION');}
    const consensusPercent=metricScores.length?Math.round(metricScores.reduce((a,b)=>a+b,0)/metricScores.length):null;
    return {
      mode,key,timestamp:hourly?key:null,date:hourly?key.slice(0,10):key,temperatureC:median(temps),tempMinC:median(mins),tempMaxC:median(maxs),
      temperatureMinAcrossModels:(hourly?temps:maxs).length?Math.min(...(hourly?temps:maxs)):null,temperatureMaxAcrossModels:(hourly?temps:maxs).length?Math.max(...(hourly?temps:maxs)):null,
      precipitationPercent:precipPercent,precipitationSource:precipSource,precipitationModelCount:robustProb?probs.length:prec.length,wetModelCount:wetVotes,
      precipitationMm:median(prec),precipitationMinAcrossModelsMm:prec.length?Math.min(...prec):null,precipitationMaxAcrossModelsMm:prec.length?Math.max(...prec):null,
      precipitationProbabilityMin:probs.length?Math.min(...probs):null,precipitationProbabilityMax:probs.length?Math.max(...probs):null,
      cloudCoverPercent:clouds.length?Math.round(median(clouds)):null,cloudCoverMinAcrossModels:clouds.length?Math.min(...clouds):null,cloudCoverMaxAcrossModels:clouds.length?Math.max(...clouds):null,
      windKmh:median(winds),windMinAcrossModels:winds.length?Math.min(...winds):null,windMaxAcrossModels:winds.length?Math.max(...winds):null,windGustKmh:median(gusts),
      condition,conditionInferred,modelCount:snaps.length,consensusPercent,consensusLevel:Number.isFinite(consensusPercent)?(consensusPercent>=75?'HIGH':consensusPercent>=50?'MEDIUM':'LOW'):null,divergenceReasons:divergence
    };
  }).filter(x=>x.modelCount>0);
}

export function selectRegularTimelinePoints(points,maxPoints=8,stepHours=3){
  if(!points.length)return [];
  if(points[0].mode!=='HOURLY')return points.slice(0,maxPoints);
  const by=new Map(points.map(x=>[x.timestamp,x]));const first=points[0].timestamp;const start=localEpoch(first);
  return Array.from({length:maxPoints},(_,slot)=>{const d=new Date(start+slot*stepHours*3600000);const ts=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}:00`;return by.get(ts)||{mode:'HOURLY',key:ts,timestamp:ts,date:ts.slice(0,10),modelCount:0,divergenceReasons:[]};});
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









export function reliabilityRanking(biases,variable='TEMPERATURE'){
  return Object.entries(biases).map(([modelId,v])=>({modelId,bias:v[variable]})).filter(x=>x.bias?.ready).sort((a,b)=>Math.abs(a.bias.meanBias)-Math.abs(b.bias.meanBias)||a.bias.stdDev-b.bias.stdDev);
}

export function windArrow(direction,speed){ if(!Number.isFinite(direction)||!Number.isFinite(speed)||speed<=5)return '';return {deg:(direction+180)%360,char:'↑'}; }
export function formatWindDirection(direction){if(!Number.isFinite(direction))return '';const dirs=['N','NE','E','SE','S','SW','W','NW'];return dirs[Math.round(direction/45)%8];}

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

function weightedStats(entries){
  const rows=(entries||[]).filter(x=>Number.isFinite(x?.value)&&Number.isFinite(x?.weight)&&x.weight>0);if(!rows.length)return null;
  const total=rows.reduce((s,x)=>s+x.weight,0),mean=rows.reduce((s,x)=>s+x.value*x.weight,0)/total,variance=rows.reduce((s,x)=>s+x.weight*(x.value-mean)**2,0)/total;
  return {mean,stdDev:Math.sqrt(variance),min:Math.min(...rows.map(x=>x.value)),max:Math.max(...rows.map(x=>x.value)),count:rows.length,totalWeight:total};
}
function weightedConfidenceContinuous(entries,tight,wide){const s=weightedStats(entries);if(!s||s.count<2)return null;return {...s,percent:scoreFromStd(s.stdDev,tight,wide),spread:s.max-s.min};}
function weightedPrecipitationConfidence(entries){
  const rows=(entries||[]).filter(x=>Number.isFinite(x?.value)&&Number.isFinite(x?.weight)&&x.weight>0);if(!rows.length)return null;
  const rain=rows.filter(x=>x.value>=1),dry=rows.filter(x=>x.value<1),sum=a=>a.reduce((s,x)=>s+x.weight,0),total=sum(rows),rw=sum(rain),dw=sum(dry);
  if(!rain.length){const max=Math.max(...rows.map(x=>x.value));return {kind:'NO_RAIN',percent:max<.1?100:90,count:rows.length,maxAmountMm:max};}
  if(!dry.length){const s=weightedStats(rain);return {kind:'RAIN',percent:scoreFromStd(s.stdDev,1,8),count:rows.length,minMm:s.min,maxMm:s.max,meanMm:s.mean};}
  const agreement=Math.max(rw,dw)/total,s=weightedStats(rain);return {kind:'DIVIDED',percent:Math.max(0,Math.min(100,Math.round((agreement-.5)*200))),count:rows.length,modelsForRain:rain.length,modelsAgainstRain:dry.length,rainMinMm:s.min,rainMaxMm:s.max,rainMeanMm:s.mean};
}
/** Agreement recomputed with optional local reliability weights. Forecast values are never altered. */
export function weightedDayConfidence(forecast,date,weightsByVariable={}){
  const rows=Object.entries(forecast.seriesByModel||{}).map(([modelId,series])=>{const i=series.daily.dates.indexOf(date);return i<0?null:{modelId,series,i};}).filter(Boolean);
  const entries=(metric,key,mapKey)=>rows.filter(x=>dailyMetricComparable(x.series,x.i,metric)&&Number.isFinite(x.series.daily[key][x.i])).map(x=>({value:x.series.daily[key][x.i],weight:Number(weightsByVariable?.[mapKey]?.[x.modelId])||1,modelId:x.modelId}));
  const tempMax=weightedConfidenceContinuous(entries('temperature','tempMax','temperature'),.5,3),tempMin=weightedConfidenceContinuous(entries('temperature','tempMin','temperature'),.5,3),windMax=weightedConfidenceContinuous(entries('wind','windSpeedMax','wind'),2,12),windGustMax=weightedConfidenceContinuous(entries('wind','windGustsMax','wind'),2,12),precipitation=weightedPrecipitationConfidence(entries('precipitation','precipitationSum','precipitation'));
  const scores=[tempMax?.percent,tempMin?.percent,precipitation?.percent,windMax?.percent].filter(Number.isFinite);return {date,tempMax,tempMin,windMax,windGustMax,precipitation,overallPercent:scores.length?Math.floor(scores.reduce((a,b)=>a+b,0)/scores.length):null,weighted:true};
}
