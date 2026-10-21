import assert from 'node:assert/strict';
import { normalizeBatchedForecast } from '../../../js/data/forecast-normalizer.js';
import { forecastSeriesIssues, normalizeForecastPayload, isForecastPayloadValid } from '../../../js/data/contracts.js';
import { currentConditions, aggregateDay, buildTimelinePoints } from '../../../js/domain.js';
import { FORECAST_ENGINES } from '../../../js/forecast-engines.js';
import { getModel } from '../../../js/models.js';
import { convertTemperature } from '../../../js/units.js';

const city={id:'apparent-test',name:'Test',latitude:48.8,longitude:2.3,timezone:'UTC'};
const models=['GFS','ICON_EU'].map(getModel);
const start=Date.parse('2026-10-22T00:00:00Z');
const times=Array.from({length:48},(_,i)=>new Date(start+i*3600_000).toISOString().slice(0,16));
const dates=['2026-10-22','2026-10-23'];
const raw={timezone:'UTC',hourly:{time:times},daily:{time:dates}};
for(const [i,model] of models.entries()){
  const suffix=model.apiKey;
  raw.hourly[`temperature_2m_${suffix}`]=times.map((_,hour)=>15+i*2+hour/48);
  raw.hourly[`apparent_temperature_${suffix}`]=times.map((_,hour)=>10+i*2+hour/48);
  raw.hourly[`precipitation_${suffix}`]=times.map(()=>0);
  raw.hourly[`wind_speed_10m_${suffix}`]=times.map(()=>12);
  raw.hourly[`cloud_cover_${suffix}`]=times.map(()=>20);
  raw.hourly[`weather_code_${suffix}`]=times.map(()=>1);
  raw.daily[`temperature_2m_max_${suffix}`]=[22+i*2,23+i*2];
  raw.daily[`temperature_2m_min_${suffix}`]=[12+i*2,13+i*2];
  raw.daily[`apparent_temperature_max_${suffix}`]=[18+i*2,19+i*2];
  raw.daily[`apparent_temperature_min_${suffix}`]=[8+i*2,9+i*2];
}
// An unusable point is not interpolated or replaced with the physical temperature.
raw.hourly[`apparent_temperature_${models[1].apiKey}`][1]=null;
raw.hourly[`apparent_temperature_${models[0].apiKey}`][2]=200;
// A bad daily min/max pair is discarded without affecting real temperature.
raw.daily[`apparent_temperature_min_${models[1].apiKey}`][1]=30;
const forecast=normalizeBatchedForecast(raw,city,models,48);
assert.ok(isForecastPayloadValid(forecast,{cityId:city.id}));
assert.deepEqual(forecast.seriesByModel.GFS.hourly.apparentTemperature.slice(0,3),[10,10+1/48,null]);
assert.equal(forecast.seriesByModel.ICON_EU.hourly.apparentTemperature[1],null);
assert.deepEqual(forecast.seriesByModel.ICON_EU.daily.apparentTempMin,[10,null]);
assert.deepEqual(forecast.seriesByModel.ICON_EU.daily.apparentTempMax,[20,null]);
assert.equal(forecast.seriesByModel.ICON_EU.daily.tempMax[1],25);
assert.ok(forecast.modelMeta.ICON_EU.qualityControl.rejectedValues>=2);
assert.ok(forecast.modelMeta.GFS.qualityControl.rejectedValues>=1);

for(const forecastEngine of FORECAST_ENGINES){
  const opts={forecastEngine,hourlyHorizonHours:48,includeModelValues:true};
  const now=currentConditions(forecast,new Date(start+8*60_000),opts);
  assert.ok(Number.isFinite(now.apparentTemperature),`${forecastEngine} current felt temperature`);
  assert.notEqual(now.apparentTemperature,now.temperature);
  const first=aggregateDay(forecast,dates[0],opts);
  assert.ok(first.apparentTempMin>=8&&first.apparentTempMin<=10);
  assert.ok(first.apparentTempMax>=18&&first.apparentTempMax<=20);
  const second=aggregateDay(forecast,dates[1],opts);
  assert.equal(second.data.length,2);
  assert.ok(second.apparentTempMax>=19&&second.apparentTempMax<=21,'bad model pair excluded');
  const hourly=buildTimelinePoints(forecast,'HOURLY',new Date(start+8*60_000),opts);
  const daily=buildTimelinePoints(forecast,'DAILY',new Date(start+8*60_000),opts);
  assert.equal(hourly.length,48);
  assert.equal(daily.length,2);
  assert.equal(hourly[1].modelValues.find(x=>x.modelId==='ICON_EU').apparentTemperature,null);
  assert.ok(Number.isFinite(hourly[1].apparentTemperatureC),'other valid model must still contribute');
  assert.ok(Number.isFinite(daily[0].apparentTempMaxC)&&Number.isFinite(daily[0].apparentTempMinC));
  assert.ok(Number.isFinite(daily[1].apparentTempMaxC),'valid model must survive a bad pair');
  assert.ok(hourly.every(p=>p.temperatureC>=p.apparentTemperatureC || p.apparentTemperatureC===null),'no unit confusion');
}

assert.equal(convertTemperature(10,'IMPERIAL'),50,'felt temperature uses the same °F conversion');
assert.equal(convertTemperature(10,'UK'),10);
const legacy=structuredClone(forecast);
for(const series of Object.values(legacy.seriesByModel)){
  delete series.hourly.apparentTemperature;
  delete series.daily.apparentTempMin;
  delete series.daily.apparentTempMax;
  assert.deepEqual(forecastSeriesIssues(series),[]);
}
assert.ok(normalizeForecastPayload(legacy,{cityId:city.id}));
assert.equal(currentConditions(legacy,new Date(start+8*60_000)).apparentTemperature,null);
assert.equal(aggregateDay(legacy,dates[0]).apparentTempMax,null);
assert.equal(buildTimelinePoints(legacy,'HOURLY',new Date(start+8*60_000))[0].apparentTemperatureC,null);
const invalid=structuredClone(forecast.seriesByModel.GFS);
invalid.hourly.apparentTemperature[0]=80;
assert.ok(forecastSeriesIssues(invalid).includes('HOURLY_apparentTemperature_INVALID'));
invalid.hourly.apparentTemperature[0]=10;
invalid.daily.apparentTempMin[0]=25;
assert.ok(forecastSeriesIssues(invalid).includes('DAILY_APPARENT_TEMPERATURE_PAIR_INVALID'));
console.log('Apparent temperature model-alignment, QC, engines, legacy cache and units: OK');
