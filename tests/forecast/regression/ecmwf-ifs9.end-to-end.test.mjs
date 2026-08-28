import assert from 'node:assert/strict';
import { fetchForecast, fetchPreviousRuns } from '../../../js/api.js';
import { resetApiUsage } from '../../../js/api-budget.js';
import { aggregateDay, buildScenarios, buildTimelinePoints, currentConditions, hourlyConfidenceBand } from '../../../js/domain.js';
import { normalizePreviousRuns } from '../../../js/features/bias.js';
import { fetchModelRunMetadata } from '../../../js/features/model-health.js';
import { familyBalancedWeights } from '../../../js/consensus.js';
import { getModel } from '../../../js/models.js';

const city={id:'ifs9-audit',name:'Paris',latitude:48.8566,longitude:2.3522,timezone:'UTC'};
const ecmwf=getModel('ECMWF'),aifs=getModel('ECMWF_AIFS'),gfs=getModel('GFS');
assert.equal(ecmwf.apiKey,'ecmwf_ifs');
assert.equal(ecmwf.resolutionKm,9);

const now=new Date();now.setUTCMinutes(0,0,0);
const isoHour=(date,offset=0)=>new Date(date.getTime()+offset*3600e3).toISOString().slice(0,16);
const hours=Array.from({length:24},(_,i)=>isoHour(now,i));
const day=hours[0].slice(0,10);
const modelValues=new Map([[ecmwf,30],[aifs,20],[gfs,10]]);
const raw={timezone:'UTC',hourly:{time:hours},daily:{time:[day]}};
for(const [model,temp] of modelValues){
  const suffix=model.apiKey;
  raw.hourly[`temperature_2m_${suffix}`]=Array(24).fill(temp);
  raw.hourly[`precipitation_${suffix}`]=Array.from({length:24},(_,i)=>model===ecmwf&&i<4?0.4:0);
  // ECMWF IFS HRES does not need a native precipitation-probability series to remain usable.
  if(model!==ecmwf)raw.hourly[`precipitation_probability_${suffix}`]=Array(24).fill(model===gfs?20:40);
  raw.hourly[`cloud_cover_${suffix}`]=Array(24).fill(model===ecmwf?85:model===aifs?60:20);
  raw.hourly[`wind_speed_10m_${suffix}`]=Array(24).fill(model===ecmwf?25:model===aifs?20:15);
  raw.hourly[`wind_direction_10m_${suffix}`]=Array(24).fill(180);
  raw.hourly[`wind_gusts_10m_${suffix}`]=Array(24).fill(model===ecmwf?40:model===aifs?32:24);
  raw.hourly[`weather_code_${suffix}`]=Array(24).fill(model===ecmwf?61:model===aifs?3:1);
  raw.daily[`temperature_2m_max_${suffix}`]=[temp+2];
  raw.daily[`temperature_2m_min_${suffix}`]=[temp-4];
  raw.daily[`precipitation_sum_${suffix}`]=[model===ecmwf?1.6:0];
  if(model!==ecmwf)raw.daily[`precipitation_probability_max_${suffix}`]=[model===gfs?20:40];
  raw.daily[`wind_speed_10m_max_${suffix}`]=[model===ecmwf?25:model===aifs?20:15];
  raw.daily[`wind_gusts_10m_max_${suffix}`]=[model===ecmwf?40:model===aifs?32:24];
  raw.daily[`wind_direction_10m_dominant_${suffix}`]=[180];
  raw.daily[`weather_code_${suffix}`]=[model===ecmwf?61:model===aifs?3:1];
  raw.daily[`sunrise_${suffix}`]=[`${day}T06:00`];
  raw.daily[`sunset_${suffix}`]=[`${day}T20:00`];
}

resetApiUsage();
let forecastUrl='';
globalThis.fetch=async url=>{forecastUrl=String(url);return new Response(JSON.stringify(raw),{status:200,headers:{'content-type':'application/json'}});};
const forecast=await fetchForecast(city,['GFS','ECMWF','ECMWF_AIFS'],1);
assert.match(forecastUrl,/models=(?:[^&]*%2C)*ecmwf_ifs(?:%2C|&)/,'forecast request must use the IFS HRES 9 km Open-Meteo key');
assert.doesNotMatch(forecastUrl,/ecmwf_ifs025/,'the old 25 km key must never be requested by the active forecast path');
assert.deepEqual(Object.keys(forecast.seriesByModel).sort(),['ECMWF','ECMWF_AIFS','GFS']);
assert.equal(forecast.seriesByModel.ECMWF.hourly.temperature2m[0],30,'ECMWF values must map from *_ecmwf_ifs payload fields');
assert.equal(forecast.seriesByModel.ECMWF.hourly.precipitationProbability[0],null,'missing deterministic probability must remain optional');
assert.equal(forecast.modelMeta.ECMWF.sourceApiKey,'ecmwf_ifs');
assert.equal(forecast.modelMeta.ECMWF.resolutionKm,9);
assert.equal(forecast.modelMeta.ECMWF.hourlyHealth.degraded,false);

// IFS and AIFS are distinct visible models but share one ECMWF consensus lineage,
// so the migration must not accidentally give the centre two independent votes.
const balance=familyBalancedWeights(['ECMWF','ECMWF_AIFS','GFS']);
assert.equal(balance.familyCount,2);
assert.equal(balance.modelCount,3);
assert.ok(Math.abs((balance.weights.ECMWF+balance.weights.ECMWF_AIFS)-balance.weights.GFS)<1e-9,'combined ECMWF lineage mass should match one independent model lineage');

const current=currentConditions(forecast,new Date(now.getTime()+10*60_000));
assert.equal(current.modelCount,3);
assert.equal(current.familyCount,2);
assert.ok(Number.isFinite(current.temperature),'current consensus must include the IFS 9 km series');

const aggregate=aggregateDay(forecast,day);
assert.equal(aggregate.data.length,3);
assert.ok(aggregate.data.some(row=>row.modelId==='ECMWF'&&row.tempMax===32),'daily aggregation must consume the 9 km daily fields');
assert.equal(aggregate.consensusFamilyCount,2);
assert.ok(Number.isFinite(aggregate.tempMax));
assert.ok(Number.isFinite(aggregate.precip));

const timeline=buildTimelinePoints(forecast,'HOURLY',new Date(now.getTime()+10*60_000));
assert.equal(timeline.length,24);
assert.equal(timeline[0].modelCount,3);
assert.equal(timeline[0].familyCount,2);
assert.ok(Number.isFinite(timeline[0].temperatureC));

const band=hourlyConfidenceBand(forecast,'TEMPERATURE',24,new Date(now.getTime()+10*60_000));
assert.equal(band.length,24);
assert.equal(band[0].modelCount,3);
assert.equal(band[0].familyCount,2);

const scenarios=buildScenarios(forecast,3);
assert.ok(scenarios.length>=1);
assert.ok(scenarios.some(s=>s.modelIds.includes('ECMWF')),'12 h scenarios must consume the active IFS 9 km series');
assert.ok(scenarios.every(s=>!s.modelIds.includes('ECMWF_IFS025_LEGACY')));

// Day+1 reliability must request and parse the same 9 km model identity.
const historyDay='2026-08-20';
const historyTimes=Array.from({length:24},(_,i)=>`${historyDay}T${String(i).padStart(2,'0')}:00`);
const previousRaw={timezone:'UTC',hourly:{time:historyTimes,
  temperature_2m_previous_day1_ecmwf_ifs:Array.from({length:24},(_,i)=>15+i/4),
  precipitation_previous_day1_ecmwf_ifs:Array(24).fill(0.1),
  wind_speed_10m_previous_day1_ecmwf_ifs:Array.from({length:24},(_,i)=>10+i/2),
}};
let previousUrl='';
globalThis.fetch=async url=>{previousUrl=String(url);return new Response(JSON.stringify(previousRaw),{status:200,headers:{'content-type':'application/json'}});};
const previous=await fetchPreviousRuns(city,[ecmwf],historyDay,historyDay);
assert.match(previousUrl,/models=ecmwf_ifs/);
assert.doesNotMatch(previousUrl,/ecmwf_ifs025/);
const reliabilityRows=normalizePreviousRuns(previous,city,[ecmwf],historyDay,historyDay);
assert.equal(reliabilityRows.filter(row=>row.modelId==='ECMWF').length,3,'temperature, rain and wind reliability rows must keep the active ECMWF identity');

// Model-health metadata must also use the 9 km key through the first-party endpoint.
let healthUrl='';
globalThis.fetch=async url=>{healthUrl=String(url);return new Response(JSON.stringify({completed:true,reference_time:'2026-08-28T00:00:00Z',valid_times:[],variables:[]}),{status:200,headers:{'content-type':'application/json'}});};
const health=await fetchModelRunMetadata([ecmwf],{concurrency:1,timeoutMs:1000});
assert.match(healthUrl,/_mcx\/model-metadata\?key=ecmwf_ifs/);
assert.equal(health.ECMWF.modelId,'ECMWF');
assert.equal(health.ECMWF.error,undefined);

console.log('ECMWF IFS HRES 9 km end-to-end forecast/consensus data chain: OK');
