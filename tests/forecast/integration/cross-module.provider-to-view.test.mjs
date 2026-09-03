import assert from 'node:assert/strict';
import { normalizeBatchedForecast } from '../../../js/data/forecast-normalizer.js';
import { isForecastPayloadValid } from '../../../js/data/contracts.js';
import {
  aggregateDay,
  buildScenarios,
  buildTimelinePoints,
  currentConditions,
  hourlyConfidenceBand,
} from '../../../js/domain.js';
import { FORECAST_ENGINES } from '../../../js/forecast-engines.js';
import { getModel } from '../../../js/models.js';

const city={id:'release-audit',name:'Release audit',latitude:48.8566,longitude:2.3522,timezone:'UTC'};
const models=['GFS','ICON_EU','ECMWF','UKMO_GLOBAL'].map(getModel);
const now=new Date();now.setUTCMinutes(0,0,0);
const date=now.toISOString().slice(0,10);
const timestamps=Array.from({length:24},(_,hour)=>new Date(now.getTime()+hour*3600_000).toISOString().slice(0,16));
const analysisTime=new Date(now.getTime()+10*60_000);
const raw={timezone:'UTC',hourly:{time:timestamps},daily:{time:[date]}};

for(const [index,model] of models.entries()){
  const suffix=model.apiKey,temperature=17+index*1.4,rain=index===3?.8:index===2?.25:0,probability=15+index*22,wind=12+index*4;
  raw.hourly[`temperature_2m_${suffix}`]=timestamps.map((_,hour)=>temperature+Math.sin(hour/24*Math.PI*2)*5);
  raw.hourly[`precipitation_${suffix}`]=timestamps.map((_,hour)=>hour>=10&&hour<=14?rain:0);
  raw.hourly[`precipitation_probability_${suffix}`]=timestamps.map((_,hour)=>hour>=10&&hour<=14?probability:5);
  raw.hourly[`cloud_cover_${suffix}`]=timestamps.map((_,hour)=>hour>=10&&hour<=14?55+index*10:20+index*5);
  raw.hourly[`wind_speed_10m_${suffix}`]=timestamps.map(()=>wind);
  raw.hourly[`wind_direction_10m_${suffix}`]=timestamps.map(()=>180+index*10);
  raw.hourly[`wind_gusts_10m_${suffix}`]=timestamps.map(()=>wind+9);
  raw.hourly[`weather_code_${suffix}`]=timestamps.map((_,hour)=>hour>=10&&hour<=14&&index>=2?61:index===3?3:2);
  raw.daily[`temperature_2m_max_${suffix}`]=[temperature+5];
  raw.daily[`temperature_2m_min_${suffix}`]=[temperature-3];
  raw.daily[`precipitation_sum_${suffix}`]=[rain*5];
  raw.daily[`precipitation_probability_max_${suffix}`]=[probability];
  raw.daily[`wind_speed_10m_max_${suffix}`]=[wind];
  raw.daily[`wind_gusts_10m_max_${suffix}`]=[wind+9];
  raw.daily[`wind_direction_10m_dominant_${suffix}`]=[180+index*10];
  raw.daily[`weather_code_${suffix}`]=[index>=2?61:2];
  raw.daily[`sunrise_${suffix}`]=[`${date}T06:30`];
  raw.daily[`sunset_${suffix}`]=[`${date}T20:45`];
}

const forecast=normalizeBatchedForecast(raw,city,models,24);
assert.equal(isForecastPayloadValid(forecast,{cityId:city.id}),true,'normalized provider payload must satisfy the persistent forecast contract');
assert.equal(Object.keys(forecast.seriesByModel).length,models.length);
assert.ok(Object.values(forecast.modelMeta).every(meta=>meta.qualityControl?.physicalLimitsApplied===true));
const snapshot=structuredClone(forecast);

const calibration=Object.fromEntries(models.map(model=>[model.id,{bias:.5,score:82,standardDeviation:1.1,meanAbsoluteError:.8,sampleSize:35}]));
const metricNames=['TEMPERATURE','PRECIPITATION_PROBABILITY','PRECIPITATION','CLOUD','WIND','GUST'];
for(const forecastEngine of FORECAST_ENGINES){
  const options={forecastEngine,weightsByVariable:{},calibrationByVariable:{temperature:calibration,precipitation:calibration,wind:calibration,cloud:calibration,gust:calibration}};
  const current=currentConditions(forecast,analysisTime,options);
  const day=aggregateDay(forecast,date,options);
  const timeline=buildTimelinePoints(forecast,'HOURLY',analysisTime,options);
  const scenarios=buildScenarios(forecast,3);

  assert.ok(Number.isFinite(current.temperature),`${forecastEngine}: current temperature must remain available`);
  assert.ok(Number.isFinite(day.tempMin)&&Number.isFinite(day.tempMax)&&day.tempMin<=day.tempMax,`${forecastEngine}: daily temperature range must stay coherent`);
  assert.ok(Number.isFinite(day.precip)&&day.precip>=0,`${forecastEngine}: daily precipitation must stay non-negative`);
  assert.equal(timeline.length,24,`${forecastEngine}: the complete normalized hourly axis must reach the chronology`);
  assert.ok(timeline.every(point=>point.modelCount===models.length&&point.familyCount>=2),`${forecastEngine}: model/family evidence must survive the pipeline`);
  assert.ok(scenarios.length>=1&&scenarios.length<=3,`${forecastEngine}: 12 h scenarios must remain bounded`);

  for(const metric of metricNames){
    const band=hourlyConfidenceBand(forecast,metric,24,analysisTime,options);
    assert.equal(band.length,24,`${forecastEngine}/${metric}: the convergence band must preserve all hourly slots`);
    assert.ok(band.every(point=>Number.isFinite(point.minValue)&&Number.isFinite(point.maxValue)&&point.minValue<=point.maxValue),`${forecastEngine}/${metric}: dispersion bounds must be finite and ordered`);
    if(metric!=='PRECIPITATION_PROBABILITY')assert.ok(band.every(point=>point.engineDetail?.interval?.low<=point.meanValue&&point.meanValue<=point.engineDetail?.interval?.high),`${forecastEngine}/${metric}: retained intervals must contain their central value`);
  }
}

assert.deepEqual(forecast,snapshot,'forecast views and engines must not mutate the normalized provider payload');

console.log('Raw-data → normalization → engines → chronology/scenarios pipeline: OK');
