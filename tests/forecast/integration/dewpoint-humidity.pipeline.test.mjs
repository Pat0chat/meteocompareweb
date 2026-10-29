import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBatchedForecast } from '../../../js/data/forecast-normalizer.js';
import { forecastSeriesIssues } from '../../../js/data/contracts.js';
import { getModel } from '../../../js/models.js';
import { currentConditions, aggregateDay, buildTimelinePoints, dailyAtmosphericMean } from '../../../js/domain.js';
import { convertUnitValue, unitSymbol } from '../../../js/units.js';

const date='2026-10-29',tomorrow='2026-10-30',now=new Date(`${date}T01:00:00.000Z`);
const city={id:'atmos',name:'Paris',latitude:48.85,longitude:2.35,timezone:'UTC',country:'France',region:'Île-de-France'};
const models=['GFS','ICON_EU'].map(getModel),timestamps=Array.from({length:48},(_,i)=>new Date(Date.parse(`${date}T00:00:00Z`)+i*3600000).toISOString().slice(0,16));
function makeRaw(){
  const raw={timezone:'UTC',hourly:{time:timestamps},daily:{time:[date,tomorrow]}};
  for(const [index,model] of models.entries()){
    const name=model.apiKey;
    for(const [field,value] of Object.entries({temperature_2m:20+index,apparent_temperature:19+index,dew_point_2m:12+index,relative_humidity_2m:60+index*10,pressure_msl:1010,precipitation:0,precipitation_probability:10,wind_speed_10m:12,wind_gusts_10m:20,wind_direction_10m:180,cloud_cover:15,weather_code:1}))raw.hourly[`${field}_${name}`]=timestamps.map(()=>value);
    for(const [field,value] of Object.entries({temperature_2m_max:25+index,temperature_2m_min:14+index,precipitation_sum:0,precipitation_probability_max:10,wind_speed_10m_max:15,wind_gusts_10m_max:20,wind_direction_10m_dominant:180,weather_code:1}))raw.daily[`${field}_${name}`]=[value,value];
  }
  return raw;
}
const raw=makeRaw(),forecast=normalizeBatchedForecast(raw,city,models,48);
for(const series of Object.values(forecast.seriesByModel)){
  assert.deepEqual(forecastSeriesIssues(series),[]);
  assert.equal(series.hourly.dewPoint2m.length,48);
  assert.equal(series.hourly.relativeHumidity2m.length,48);
  assert.ok(Number.isFinite(dailyAtmosphericMean(series,date,'dewPoint2m',{min:-100,max:65})));
}
const current=currentConditions(forecast,now);
assert.ok(current.dewPoint>=12&&current.dewPoint<=13);
assert.ok(current.humidity>=60&&current.humidity<=70);
const day=aggregateDay(forecast,date);
assert.ok(day.dewPoint>=12&&day.dewPoint<=13);
assert.ok(day.humidity>=60&&day.humidity<=70);
assert.ok(day.dewPointRange[0]<day.dewPointRange[1]);
assert.ok(day.humidityRange[0]<day.humidityRange[1]);
assert.ok(day.engineDetails.dewPoint&&day.engineDetails.humidity);
for(const mode of ['HOURLY','DAILY']){
  const points=buildTimelinePoints(forecast,mode,now,{hourlyHorizonHours:48,includeModelValues:true});
  assert.ok(points.length>=2,`${mode} timeline`);
  for(const point of points){
    assert.ok(point.dewPointC>=12&&point.dewPointC<=13);
    assert.ok(point.relativeHumidityPercent>=60&&point.relativeHumidityPercent<=70);
    assert.equal(point.modelValues.length,2);
    assert.ok(Number.isFinite(point.dewPointMinAcrossModels));
    assert.ok(Number.isFinite(point.humidityMaxAcrossModels));
  }
}
assert.equal(convertUnitValue('temperature',12,'METRIC'),12);
assert.equal(convertUnitValue('temperature',12,'UK'),12);
assert.equal(convertUnitValue('temperature',12,'IMPERIAL'),53.6);
assert.equal(unitSymbol('temperature','IMPERIAL'),'°F');
assert.equal(unitSymbol('temperature','UK'),'°C');

// Backward compatibility: existing cached weather forecasts may omit the new fields.
const old=structuredClone(forecast);
for(const series of Object.values(old.seriesByModel)){delete series.hourly.dewPoint2m;delete series.hourly.relativeHumidity2m;}
for(const point of buildTimelinePoints(old,'HOURLY',now)){
  assert.equal(point.dewPointC,null);
  assert.equal(point.relativeHumidityPercent,null);
  assert.ok(Number.isFinite(point.temperatureC));
}
assert.equal(currentConditions(old,now).dewPoint,null);
assert.equal(aggregateDay(old,date).humidity,null);

// Out-of-range values must be rejected independently of the core temperature series.
raw.hourly[`dew_point_2m_${models[0].apiKey}`][0]=100;
raw.hourly[`relative_humidity_2m_${models[0].apiKey}`][0]=130;
const bounded=normalizeBatchedForecast(raw,city,models,48).seriesByModel[models[0].id];
assert.equal(bounded.hourly.dewPoint2m[0],null);
assert.equal(bounded.hourly.relativeHumidity2m[0],null);
assert.equal(bounded.hourly.temperature2m[0],20);
const invalid=structuredClone(bounded);invalid.hourly.relativeHumidity2m[0]=101;
assert.ok(forecastSeriesIssues(invalid).includes('HOURLY_relativeHumidity2m_INVALID'));

const api=readFileSync(new URL('../../../js/api.js',import.meta.url),'utf8');
assert.match(api,/dew_point_2m','relative_humidity_2m'/);
assert.match(api,/includeAtmospheric\?HOURLY_VARS/,'unsupported model can fall back to original core fields');
console.log('Dew point and humidity: multi-model data pipeline, missing values, quality and units OK');
