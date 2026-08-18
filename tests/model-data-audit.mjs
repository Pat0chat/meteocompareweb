import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fetchForecast, fetchPreviousRuns, normalizeBatchedForecast, hourlySeriesHealth } from '../js/api.js';
import { normalizePreviousRuns } from '../js/domain.js';
import { WEATHER_MODELS, getModel } from '../js/models.js';
import { webTranslationAudit } from '../js/i18n.js';

const city={id:'audit',name:'Paris',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris'};
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../js/api.js',import.meta.url),'utf8');
const modelSource=fs.readFileSync(new URL('../js/models.js',import.meta.url),'utf8');

// Provider-contract metadata used by health checks / recovery. Short regional
// models must not inherit the 7-day request horizon of a long global model.
assert.equal(WEATHER_MODELS.length,17);
assert.equal(getModel('AROME_FRANCE_HD').horizonHours,48);
assert.equal(getModel('AROME_FRANCE_HD').maxForecastDays,2);
assert.equal(getModel('AROME_FRANCE').maxForecastDays,2);
assert.equal(getModel('ARPEGE_WORLD').nativeStepMinutes,60);
assert.equal(getModel('ICON_D2').horizonHours,48);
assert.equal(getModel('METNO_NORDIC').horizonHours,60);
assert.equal(getModel('KNMI_HARMONIE_EU').horizonHours,60);
assert.equal(getModel('HRRR_CONUS').horizonHours,18);
assert.equal(getModel('HRRR_CONUS').recoveryRequestHours,48);
assert.equal(getModel('HRRR_CONUS').supportsDay1Bias,false);
assert.equal(getModel('ECMWF_AIFS').nativeStepMinutes,360);
assert.equal(getModel('CMA_GRAPES').nativeStepMinutes,180);


// A partial critical variable is enough to mark a series degraded even when
// the other variables are complete. Optional variables must not affect health.
const iconHealthModel=getModel('ICON_D2');
const criticalHealth=hourlySeriesHealth({hourly:{
  temperature2m:Array(48).fill(12),
  precipitation:[...Array(4).fill(0),...Array(44).fill(null)],
  windSpeed10m:Array(48).fill(15),
  precipitationProbability:Array(48).fill(null),
}},iconHealthModel,48);
assert.equal(criticalHealth.degraded,true,'a truncated critical precipitation series must degrade model health');
assert.equal(criticalHealth.counts.temperature,48);
assert.equal(criticalHealth.counts.precipitation,4);

const hours=(n,start='2026-08-18T00:00:00Z')=>Array.from({length:n},(_,i)=>new Date(Date.parse(start)+i*3600e3).toISOString().slice(0,16));
const suffix=(base,m)=>`${base}_${m.apiKey}`;
function modelArray(n,limit,fn){return Array.from({length:n},(_,i)=>i<limit?fn(i):null);}
function allModelRaw(n=168,short={}){
  const time=hours(n),hourly={time};
  for(const m of WEATHER_MODELS){
    const nominal=Math.min(n,m.horizonHours),limit=short[m.id]??nominal;
    hourly[suffix('temperature_2m',m)]=modelArray(n,limit,i=>10+i/100);
    hourly[suffix('precipitation',m)]=modelArray(n,limit,i=>i%13===0?.2:0);
    hourly[suffix('wind_speed_10m',m)]=modelArray(n,limit,i=>12+i%4);
    hourly[suffix('weather_code',m)]=modelArray(n,limit,()=>1);
    // Deliberately omit precipitation_probability: it is optional and must
    // never make a deterministic model look broken.
  }
  return {timezone:'Europe/Paris',hourly};
}

// Every one of the 17 suffixes must split/map independently and the nominal
// short horizons must be considered healthy inside a 168 h batched timeline.
const normalized=normalizeBatchedForecast(allModelRaw(),city,WEATHER_MODELS,168);
for(const m of WEATHER_MODELS){
  assert.ok(normalized.seriesByModel[m.id],`${m.id} should map from its API suffix`);
  const health=normalized.modelMeta[m.id].hourlyHealth;
  assert.equal(health.degraded,false,`${m.id} nominal horizon must not be treated as truncated`);
  assert.equal(health.expected,Math.min(168,m.horizonHours),`${m.id} health expectation must follow its own horizon`);
  assert.equal(normalized.seriesByModel[m.id].hourly.precipitationProbability.every(v=>v==null),true,`${m.id}: missing probability is optional`);
}

// Generic recovery: three unrelated models are truncated in the first batch.
// They must be retried together in one smaller request, not via ICON-D2-only
// special casing or 3 separate network calls.
const main=allModelRaw(168,{AROME_FRANCE_HD:3,ICON_D2:4,METNO_NORDIC:5});
const recoveryModels=['AROME_FRANCE_HD','ICON_D2','METNO_NORDIC'].map(getModel),recoveryTime=hours(60),recovery={timezone:'Europe/Paris',hourly:{time:recoveryTime}};
for(const m of recoveryModels){
  const limit=Math.min(recoveryTime.length,m.horizonHours);
  recovery.hourly[suffix('temperature_2m',m)]=modelArray(60,limit,i=>11+i/100);
  recovery.hourly[suffix('precipitation',m)]=modelArray(60,limit,()=>0);
  recovery.hourly[suffix('wind_speed_10m',m)]=modelArray(60,limit,()=>15);
  recovery.hourly[suffix('weather_code',m)]=modelArray(60,limit,()=>1);
}
const urls=[];globalThis.fetch=async url=>({ok:true,json:async()=>{urls.push(String(url));return urls.length===1?main:recovery;}});
const recovered=await fetchForecast(city,WEATHER_MODELS.map(m=>m.id),7);
assert.equal(urls.length,2,'all suspicious models should share one recovery request');
for(const id of ['AROME_FRANCE_HD','ICON_D2','METNO_NORDIC']){
  assert.equal(recovered.modelMeta[id].recoveredFromBatch,true,`${id} should be recovered generically`);
  assert.equal(recovered.modelMeta[id].hourlyHealth.degraded,false,`${id} should be healthy after recovery`);
}
assert.match(urls[1],/meteofrance_arome_france_hd/);
assert.match(urls[1],/icon_d2/);
assert.match(urls[1],/metno_nordic/);
assert.doesNotMatch(urls[1],/ncep_gfs_seamless/,'healthy models must not be retried');
assert.match(urls[1],/forecast_hours=60/,'recovery window must match the longest suspicious nominal horizon');

// A model that is completely unavailable (usually outside a regional domain)
// must not trigger pointless recovery traffic.
const regionalCity={...city,id:'nyc',name:'New York',latitude:40.7,longitude:-74,timezone:'America/New_York'};
const t=hours(168),gfs=getModel('GFS'),gfsOnly={timezone:'America/New_York',hourly:{time:t}};
for(const base of ['temperature_2m','precipitation','wind_speed_10m','weather_code'])gfsOnly.hourly[suffix(base,gfs)]=modelArray(168,168,i=>base==='weather_code'?1:base==='precipitation'?0:15+i/100);
let outsideCalls=0;globalThis.fetch=async()=>({ok:true,json:async()=>{outsideCalls++;return gfsOnly;}});
const outside=await fetchForecast(regionalCity,['ICON_D2','GFS'],7);
assert.equal(outsideCalls,1,'fully unavailable regional models must not be retried');
assert.equal(outside.errors.ICON_D2,'MODEL_UNAVAILABLE');

// Future daily aggregates from a short/partial horizon must not enter daily
// agreement. Today remains valid because the rolling hourly request starts now.
const arome=getModel('AROME_FRANCE'),twoDays=hours(48),partialTemp=modelArray(48,28,i=>15+i/10),partial={timezone:'Europe/Paris',hourly:{time:twoDays,temperature_2m:partialTemp,precipitation:modelArray(48,28,()=>0),wind_speed_10m:modelArray(48,28,()=>10),weather_code:modelArray(48,28,()=>1)},daily:{time:['2026-08-18','2026-08-19'],temperature_2m_max:[26,29],temperature_2m_min:[15,16],precipitation_sum:[0,4],wind_speed_10m_max:[18,25],wind_gusts_10m_max:[30,40],wind_direction_10m_dominant:[180,190],weather_code:[1,61],sunrise:['2026-08-18T06:30','2026-08-19T06:31'],sunset:['2026-08-18T20:55','2026-08-19T20:53']}};
const p=normalizeBatchedForecast(partial,city,[arome],48).seriesByModel.AROME_FRANCE;
assert.equal(p.daily.tempMax[0],26,'today daily aggregate should remain provider-authored');
for(const key of ['tempMax','tempMin','precipitationSum','windSpeedMax','windGustsMax','windDirection10mDominant','weatherCode'])assert.equal(p.daily[key][1],null,`partial future daily ${key} must be excluded`);
assert.equal(p.daily.sunrise[1],'2026-08-19T06:31','astronomical fields are independent of model horizon');


// Variable-specific daily sanitation: a rain-only hourly truncation must not
// erase valid temperature/wind daily values, but daily precipitation must not
// participate in agreement.
const rainOnlyPartial={timezone:'Europe/Paris',hourly:{time:twoDays,
  temperature_2m:modelArray(48,48,i=>15+i/10),
  precipitation:modelArray(48,28,()=>0),
  wind_speed_10m:modelArray(48,48,()=>10),
  weather_code:modelArray(48,48,()=>1)},daily:{time:['2026-08-18','2026-08-19'],
  temperature_2m_max:[26,29],temperature_2m_min:[15,16],precipitation_sum:[0,4],precipitation_probability_max:[0,80],
  wind_speed_10m_max:[18,25],wind_gusts_10m_max:[30,40],wind_direction_10m_dominant:[180,190],weather_code:[1,1],
  sunrise:['2026-08-18T06:30','2026-08-19T06:31'],sunset:['2026-08-18T20:55','2026-08-19T20:53']}};
const rp=normalizeBatchedForecast(rainOnlyPartial,city,[arome],48).seriesByModel.AROME_FRANCE;
assert.equal(rp.daily.tempMax[1],29,'valid future temperature aggregate should survive rain-only truncation');
assert.equal(rp.daily.windSpeedMax[1],25,'valid future wind aggregate should survive rain-only truncation');
assert.equal(rp.daily.precipitationSum[1],null,'partial future precipitation aggregate must be excluded');
assert.equal(rp.daily.precipitationProbabilityMax[1],null,'partial future precipitation probability must be excluded');


// Previous Runs uses the same defensive strategy. A model with a partially
// populated day1 series is retried as a small cohort, then merged by timestamp
// before the strict 23/24/25-hour daily bootstrap is applied.
const biasModels=[getModel('GFS'),getModel('ICON_D2')],biasTimes=hours(24,'2026-08-01T00:00:00Z'),prevMain={timezone:'Europe/Paris',hourly:{time:biasTimes}},prevRecovery={timezone:'Europe/Paris',hourly:{time:biasTimes}};
for(const m of biasModels){
  const short=m.id==='ICON_D2'?3:24;
  prevMain.hourly[`temperature_2m_previous_day1_${m.apiKey}`]=modelArray(24,short,i=>20+i/10);
  prevMain.hourly[`precipitation_previous_day1_${m.apiKey}`]=modelArray(24,short,()=>.1);
  prevMain.hourly[`wind_speed_10m_previous_day1_${m.apiKey}`]=modelArray(24,short,()=>14);
}
prevRecovery.hourly.temperature_2m_previous_day1=modelArray(24,24,i=>21+i/10);
prevRecovery.hourly.precipitation_previous_day1=modelArray(24,24,()=>.2);
prevRecovery.hourly.wind_speed_10m_previous_day1=modelArray(24,24,()=>16);
const prevUrls=[];globalThis.fetch=async url=>({ok:true,json:async()=>{prevUrls.push(String(url));return prevUrls.length===1?prevMain:prevRecovery;}});
const prevRaw=await fetchPreviousRuns(city,biasModels,'2026-08-01','2026-08-01');
assert.equal(prevUrls.length,2,'a partial Previous Runs model should trigger one recovery call');
assert.match(prevUrls[1],/models=icon_d2/,'Previous Runs recovery should isolate only the suspicious model');
assert.doesNotMatch(prevUrls[1],/ncep_gfs_seamless/,'healthy Previous Runs models should not be retried');
const prevRecords=normalizePreviousRuns(prevRaw,city,biasModels,'2026-08-01','2026-08-01');
assert.equal(prevRecords.filter(r=>r.modelId==='ICON_D2').length,3,'recovered ICON-D2 Previous Runs day should produce all bias variables');
assert.equal(prevRecords.filter(r=>r.modelId==='GFS').length,3,'healthy GFS Previous Runs data should survive merge unchanged');

// Day+1 bias cannot be built robustly from HRRR's normal 18-hour cycles. The
// expensive Previous Runs planner therefore excludes it instead of repeatedly
// requesting a structurally incomplete history.
assert.match(app,/selectedModels\(targetIds\)\.filter\(m=>m\.supportsDay1Bias!==false\)/);
assert.match(app,/day1BiasUnavailable/);
assert.match(app,/partialHourlyData/,'a still-partial model must be surfaced in the detailed-table header');
assert.match(modelSource,/HRRR_CONUS[\s\S]*supportsDay1Bias:false/);

// Core retrieval contracts remain explicit: Forecast rolling hours, ERA5
// normals, Previous Runs day1, and archive reference variables.
assert.match(api,/forecast_hours/);
assert.match(api,/models','era5'/);
assert.match(api,/temperature_2m_previous_day1,precipitation_previous_day1,wind_speed_10m_previous_day1/);
assert.match(api,/temperature_2m_max,precipitation_sum,wind_speed_10m_max/);

for(const [lang,missing] of Object.entries(webTranslationAudit()))assert.deepEqual(missing,[],`missing web translations for ${lang}`);
console.log('MeteoCompare Web all-model/data retrieval audit tests: OK');
