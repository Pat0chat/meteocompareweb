import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  addDays, cityToday, dayConfidence, weightedDayConfidence, zonedLocalTimestampEpoch, zonedTimestampEpochs, currentConditions, hourlyConfidenceBand, buildTimelinePoints, roundedHourLocal
} from '../js/domain.js';
import { normalizeMarine, nearestMarineIndex, detectTideEvents, tideRangeNext24h } from '../js/features/marine.js';
import { buildEvolution } from '../js/features/evolution.js';
import { computeBiases, normalizePreviousRuns, BIAS_REFERENCE_LAG_DAYS } from '../js/features/bias.js';
import { buildModelHealthReport } from '../js/features/model-health.js';
import { renderTargetedModelComparison } from '../js/features/comparison.js';
import { fetchBiasArchive } from '../js/api.js';
import { getModel } from '../js/models.js';

// 1. Local Open-Meteo timestamps must be interpreted in the city's timezone,
// not in the browser/Node timezone.
assert.equal(new Date(zonedLocalTimestampEpoch('2026-08-18T12:00','Europe/Paris')).toISOString(),'2026-08-18T10:00:00.000Z');
assert.equal(new Date(zonedLocalTimestampEpoch('2026-08-18T12:00','Asia/Tokyo')).toISOString(),'2026-08-18T03:00:00.000Z');
assert.equal(new Date(zonedLocalTimestampEpoch('2026-08-18T12:00','America/New_York')).toISOString(),'2026-08-18T16:00:00.000Z');

// Autumn DST fold: the two 02:00 values are distinct consecutive instants.
const fold=zonedTimestampEpochs(['2026-10-25T01:00','2026-10-25T02:00','2026-10-25T02:00','2026-10-25T03:00'],'Europe/Paris');
assert.deepEqual(fold.map(x=>new Date(x).toISOString()),[
  '2026-10-24T23:00:00.000Z','2026-10-25T00:00:00.000Z','2026-10-25T01:00:00.000Z','2026-10-25T02:00:00.000Z'
]);
assert.ok(fold.slice(1).every((x,i)=>x-fold[i]===3600e3));
// Spring DST gap: rounding 01:45 local must jump to the next real civil hour,
// never fabricate the nonexistent 02:00 in Europe/Paris.
assert.equal(roundedHourLocal('Europe/Paris',new Date('2026-03-29T00:45:00.000Z')),'2026-03-29T03:00');

// Main forecast hourly consumers keep both repeated civil hours distinct too.
const foldTimes=['2026-10-25T01:00','2026-10-25T02:00','2026-10-25T02:00','2026-10-25T03:00','2026-10-25T04:00'];
const foldEpochs=zonedTimestampEpochs(foldTimes,'Europe/Paris');
const foldSeries=valueOffset=>({hourly:{timestamps:foldTimes,timestampEpochMs:foldEpochs,temperature2m:[10,11,20,21,22].map(v=>v+valueOffset),precipitation:[0,0,0,0,0],precipitationProbability:[0,0,0,0,0],cloudCover:[10,10,10,10,10],windSpeed10m:[10,10,10,10,10],windGusts10m:[15,15,15,15,15],windDirection10m:[180,180,180,180,180],weatherCode:[0,0,0,0,0]},daily:{dates:[]}});
const foldForecast={city:{timezone:'Europe/Paris'},seriesByModel:{GFS:foldSeries(0),ECMWF:foldSeries(2)}};
assert.equal(currentConditions(foldForecast,new Date('2026-10-25T01:10:00Z')).temperature,21,'second folded 02:00 must use the second absolute hour');
const foldBand=hourlyConfidenceBand(foldForecast,'TEMPERATURE',4,new Date('2026-10-24T23:10:00Z'));
assert.deepEqual(foldBand.map(x=>x.timestamp),['2026-10-25T01:00','2026-10-25T02:00','2026-10-25T02:00','2026-10-25T03:00']);
assert.deepEqual(foldBand.map(x=>x.epochMs),foldEpochs.slice(0,4));
const foldTimeline=buildTimelinePoints(foldForecast,'HOURLY',new Date('2026-10-24T23:10:00Z'));
assert.equal(foldTimeline.filter(x=>x.timestamp==='2026-10-25T02:00').length,2,'timeline must retain both DST-fold hours');

// 2. Marine current/tide calculations use absolute instants derived from timezone-aware data.
const tokyoTimes=Array.from({length:36},(_,i)=>`2026-08-${String(18+Math.floor(i/24)).padStart(2,'0')}T${String(i%24).padStart(2,'0')}:00`);
const sea=tokyoTimes.map((_,i)=>Math.sin(i*Math.PI/6));
const marine=normalizeMarine({latitude:35.6,longitude:139.7,timezone:'Asia/Tokyo',hourly:{
  time:tokyoTimes,wave_height:tokyoTimes.map(()=>1),wave_direction:tokyoTimes.map(()=>180),wave_period:tokyoTimes.map(()=>8),
  swell_wave_height:tokyoTimes.map(()=>.6),swell_wave_direction:tokyoTimes.map(()=>190),swell_wave_period:tokyoTimes.map(()=>10),
  sea_surface_temperature:tokyoTimes.map(()=>26),sea_level_height_msl:sea
}},{latitude:35.6,longitude:139.7,timezone:'Asia/Tokyo'});
const tokyoNow=Date.parse('2026-08-18T03:10:00.000Z'); // 12:10 local
assert.equal(nearestMarineIndex(marine,tokyoNow),12,'marine current index must use Tokyo local time');
const tideEvents=detectTideEvents(marine,{hours:20,now:tokyoNow});
assert.ok(tideEvents.length>=2 && tideEvents.every(e=>e.epochMs>=tokyoNow-3600e3));
assert.ok(tideRangeNext24h(marine,tokyoNow)?.range>1.5);

// 3. Agreement is genuinely multi-model for every variable, including rain.
const date='2026-08-19';
const one={hourly:{timestamps:[]},daily:{dates:[date],tempMax:[null],tempMin:[null],precipitationSum:[0],windSpeedMax:[null],windGustsMax:[null],windDirection10mDominant:[null],precipitationProbabilityMax:[0],weatherCode:[0],sunrise:[null],sunset:[null]}};
const oneForecast={city:{timezone:'UTC'},seriesByModel:{GFS:one}};
const oneConf=dayConfidence(oneForecast,date);
assert.ok(oneConf.precipitation,'one-family weather data must remain available even when convergence cannot be scored');
assert.equal(oneConf.precipitation.percent,null,'one dry model must not produce a rain convergence score');
assert.equal(oneConf.precipitation.probabilityPercent,0,'native rain probability must remain visible with one family');
assert.equal(oneConf.overallPercent,null,'one model must not produce a global convergence score');
const weightedOne=weightedDayConfidence(oneForecast,date,{precipitation:{GFS:1.2}});
assert.ok(weightedOne.precipitation);
assert.equal(weightedOne.precipitation.percent,null);

// 4. Evolution ignores terminal PARTIAL days and ignores legacy snapshots once
// completeness-aware forecasts are in use.
function evolutionSeries(tempStatus='PARTIAL'){
  return {daily:{dates:[date],tempMax:[25],tempMin:[15],precipitationSum:[2],windSpeedMax:[30],windGustsMax:[45],windDirection10mDominant:[180],precipitationProbabilityMax:[60],weatherCode:[61],sunrise:[null],sunset:[null],completeness:{temperature:[{status:tempStatus}],precipitation:[{status:'FULL'}],wind:[{status:'FULL'}],condition:[{status:'FULL'}]}}};
}
const evoNow=Date.parse('2026-08-18T12:00:00.000Z');
const evoForecast={city:{timezone:'UTC'},fetchedAt:new Date(evoNow).toISOString(),seriesByModel:{GFS:evolutionSeries(),ECMWF:evolutionSeries()}};
const auditedSnapshot={qualityVersion:2,capturedAt:evoNow-24*3600e3,daily:{[date]:{GFS:{temperature:20,precipitation:1,wind:25},ECMWF:{temperature:21,precipitation:1,wind:26}}}};
const evo=buildEvolution(evoForecast,[auditedSnapshot]);
assert.ok(evo.days.length===1);
assert.equal(evo.days[0].variables.temperature,undefined,'PARTIAL current temperature must not enter evolution');
assert.ok(evo.days[0].variables.precipitation && evo.days[0].variables.wind);
assert.equal(buildEvolution(evoForecast,[{...auditedSnapshot,qualityVersion:undefined}]).days.length,0,'legacy snapshots must not contaminate completeness-aware evolution');

// Storage snapshot v2 also nulls PARTIAL variables at capture time.
class MemoryStorage{constructor(){this.m=new Map();}getItem(k){return this.m.has(k)?this.m.get(k):null;}setItem(k,v){this.m.set(k,String(v));}removeItem(k){this.m.delete(k);}key(i){return [...this.m.keys()][i]??null;}get length(){return this.m.size;}}
globalThis.localStorage=new MemoryStorage();
const storage=await import(`../js/storage.js?release-audit=${Date.now()}`);
const stored=storage.recordEvolutionSnapshot('audit-city',evoForecast);
assert.equal(stored.at(-1).qualityVersion,2);
assert.equal(stored.at(-1).daily[date].GFS.temperature,null);
assert.equal(stored.at(-1).daily[date].GFS.precipitation,2);

// 5. Local reliability uses a complete 30-day ERA5 window ending behind the
// reanalysis publication lag, not the last 30 wall-clock days.
assert.equal(BIAS_REFERENCE_LAG_DAYS,6);
const today='2026-08-18',biasEnd=addDays(today,-BIAS_REFERENCE_LAG_DAYS),biasStart=addDays(biasEnd,-29),forecasts=[],observations=[];
for(let d=biasStart;d<=biasEnd;d=addDays(d,1)){forecasts.push({modelId:'GFS',variable:'TEMPERATURE',targetDate:d,value:20});observations.push({variable:'TEMPERATURE',targetDate:d,value:19});}
forecasts.push({modelId:'GFS',variable:'TEMPERATURE',targetDate:addDays(biasEnd,1),value:100});observations.push({variable:'TEMPERATURE',targetDate:addDays(biasEnd,1),value:0});
const biases=computeBiases({reference:'ERA5',forecasts,observations},today);
assert.equal(biases.GFS.TEMPERATURE.sampleSize,30);
assert.equal(biases.GFS.TEMPERATURE.meanBias,1);

let archiveUrl='';
globalThis.fetch=async url=>{archiveUrl=String(url);return {ok:true,headers:{get:()=>null},json:async()=>({daily:{time:[]}})};};
await fetchBiasArchive({latitude:48.85,longitude:2.35,timezone:'Europe/Paris'},biasStart,biasEnd);
assert.match(archiveUrl,/models=era5/,'local reliability reference must explicitly request ERA5');
assert.match(archiveUrl,/temperature_unit=celsius/,'ERA5 reliability reference must use explicit temperature units');
assert.deepEqual(computeBiases({forecasts,observations},today),{},'unversioned legacy references must not feed local weighting');

// Previous-runs bootstrap rejects a truncated civil day even if it has many values.
const gfs=getModel('GFS'),badTimes=Array.from({length:23},(_,i)=>`2026-08-01T${String(i+1).padStart(2,'0')}:00`),badRaw={hourly:{time:badTimes}};
for(const base of ['temperature_2m','precipitation','wind_speed_10m']) badRaw.hourly[`${base}_previous_day1_${gfs.apiKey}`]=badTimes.map(()=>base==='temperature_2m'?20:1);
assert.equal(normalizePreviousRuns(badRaw,{timezone:'UTC'},[gfs],'2026-08-01','2026-08-01').length,0);

// 6. Model health cadence is based on the last completed ingestion, not run initialisation.
const model=getModel('GFS'),healthNow=Date.parse('2026-08-18T12:00:00.000Z');
const healthForecast={city:{timezone:'UTC'},seriesByModel:{GFS:{}},modelMeta:{GFS:{coverageByVariable:{temperature:{count:24,lastTimestamp:'2026-08-19T00:00'},precipitation:{count:24,lastTimestamp:'2026-08-19T00:00'},wind:{count:24,lastTimestamp:'2026-08-19T00:00'},conditions:{count:24,lastTimestamp:'2026-08-19T00:00'}}}},errors:{}};
const meta={GFS:{referenceTime:new Date(healthNow-10*3600e3).toISOString(),lastModifiedTime:new Date(healthNow-3*3600e3).toISOString(),responseMs:20}};
let report=buildModelHealthReport(healthForecast,[model],['GFS'],meta,[],healthNow),row=report.rows[0];
assert.equal(row.healthStatus,'OK','recent completed ingestion must be healthy even if model initialisation is old');
assert.equal(row.cadenceBase,'MODIFIED');
assert.equal(row.expectedRunAt,new Date(healthNow+3*3600e3).toISOString());
meta.GFS.lastModifiedTime=new Date(healthNow-7*3600e3).toISOString();
report=buildModelHealthReport(healthForecast,[model],['GFS'],meta,[],healthNow);assert.equal(report.rows[0].healthStatus,'DELAYED');

const absentGlobal={city:{timezone:'UTC'},seriesByModel:{},modelMeta:{},errors:{GFS:'MODEL_UNAVAILABLE'}};
report=buildModelHealthReport(absentGlobal,[model],['GFS'],{GFS:{...meta.GFS,lastModifiedTime:new Date(healthNow).toISOString()}},[],healthNow);
assert.equal(report.rows[0].healthStatus,'DEGRADED','an active global model with no forecast data must never be reported healthy');

// 7. Model comparison must neither consume PARTIAL daily values nor visually
// bridge a missing day with a continuous SVG segment.
const cmpToday=cityToday('UTC'),cmpDates=[cmpToday,addDays(cmpToday,1),addDays(cmpToday,2)];
function compareSeries(values,statuses){return {hourly:{timestamps:[],temperature2m:[],precipitation:[],windSpeed10m:[]},daily:{dates:cmpDates,tempMax:values,tempMin:values.map(v=>v-8),precipitationSum:[0,0,0],windSpeedMax:[20,20,20],completeness:{temperature:statuses.map(status=>({status})),precipitation:statuses.map(()=>({status:'FULL'})),wind:statuses.map(()=>({status:'FULL'})),condition:statuses.map(()=>({status:'FULL'}))}}};}
const cmpForecast={city:{timezone:'UTC'},seriesByModel:{GFS:compareSeries([20,99,22],['FULL','PARTIAL','FULL']),ECMWF:compareSeries([21,22,23],['FULL','FULL','FULL'])}};
const ctx={t:(k,v={})=>k==='selectedModelsCount'?String(v.count):k,locale:'en-GB',esc:String,attr:String,fmt:v=>String(v),dateLabel:d=>d,timeLabel:s=>s.slice(11,16),visibleModelIds:()=>['GFS','ECMWF'],selectedModelIds:['GFS','ECMWF']};
const comparisonHtml=renderTargetedModelComparison(cmpForecast,'TEMPERATURE','DAILY',ctx);
assert.ok(!comparisonHtml.includes(`GFS · ${cmpDates[1]} · 99 °C`),'PARTIAL comparison value must be excluded');
const paths=[...comparisonHtml.matchAll(/class="compare-line"[^>]*d="([^"]*)"/g)].map(m=>m[1]);
assert.ok(paths.some(d=>(d.match(/\bM\b/g)||[]).length>=2),'a missing day must start a new SVG segment instead of being bridged');

// Targeted hourly model comparison must retain both occurrences of a folded
// local hour rather than collapsing them onto one key.
const foldCtx={...ctx,selectedModelIds:['GFS','ECMWF']};
const foldComparisonHtml=renderTargetedModelComparison(foldForecast,'TEMPERATURE','HOURLY',foldCtx);
assert.ok((foldComparisonHtml.match(/2026-10-25T02:00/g)||[]).length>=2,'hourly model comparison must keep both repeated DST hours');

// The app consumes the hourly ICON-D2 product. Its metadata must therefore
// describe that product, not the separate 15-minute dataset.
assert.equal(getModel('ICON_D2').nativeStepMinutes,60);

// Static guard: the audited marine path must no longer parse timezone-less provider timestamps with Date.parse.
const marineSource=fs.readFileSync(new URL('../js/features/marine.js',import.meta.url),'utf8'),appSource=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
assert.doesNotMatch(marineSource,/Date\.parse\(ts\[i\]\)/);
assert.doesNotMatch(appSource,/findIndex\(x=>Date\.parse\(x\)/);
assert.match(appSource,/BIAS_REFERENCE_LAG_DAYS=6/);
assert.match(appSource,/data-agreement-epoch/, 'agreement drill-down must preserve absolute DST-safe instants');
const releaseVersion=fs.readFileSync(new URL('../VERSION',import.meta.url),'utf8').trim(),swSource=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert.ok(releaseVersion.localeCompare('1.10.11',undefined,{numeric:true,sensitivity:'base'})>=0,`unexpected release version ${releaseVersion}`);
assert.match(swSource,/const APP_VERSION = '\d+\.\d+\.\d+'/);
assert.match(swSource,/CACHE_VERSION = globalThis\.METEOCOMPARE_CACHE_VERSION/);

console.log('MeteoCompare Web 1.10.8 release data-chain audit: OK');
