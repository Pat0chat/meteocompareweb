import assert from 'node:assert/strict';
import { normalizeBatchedForecast } from '../../../js/data/forecast-normalizer.js';
import { forecastSeriesIssues, isForecastPayloadValid } from '../../../js/data/contracts.js';
import { buildTimelinePoints } from '../../../js/domain.js';
import { getModel } from '../../../js/models.js';

const city={id:'pressure-audit',name:'Pressure audit',latitude:48.85,longitude:2.35,timezone:'UTC'};
const models=['GFS','ECMWF'].map(getModel);
const times=['2026-10-01T09:00','2026-10-01T10:00','2026-10-01T11:00'];
const date='2026-10-01';
const raw={timezone:'UTC',hourly:{time:times},daily:{time:[date]}};
const pressures={GFS:[1010,1012,1014],ECMWF:[1014,1016,1018]};
const daily={GFS:{mean:1012,min:1008,max:1016},ECMWF:{mean:1016,min:1012,max:1020}};

for(const model of models){
  const suffix=model.apiKey,modelPressure=pressures[model.id],dailyPressure=daily[model.id];
  raw.hourly[`temperature_2m_${suffix}`]=[15,16,17];
  raw.hourly[`pressure_msl_${suffix}`]=modelPressure;
  raw.hourly[`precipitation_${suffix}`]=[0,0,0];
  raw.hourly[`precipitation_probability_${suffix}`]=[0,0,0];
  raw.hourly[`cloud_cover_${suffix}`]=[20,30,40];
  raw.hourly[`wind_speed_10m_${suffix}`]=[10,11,12];
  raw.hourly[`wind_direction_10m_${suffix}`]=[180,180,180];
  raw.hourly[`wind_gusts_10m_${suffix}`]=[15,16,17];
  raw.hourly[`weather_code_${suffix}`]=[1,1,2];
  raw.daily[`temperature_2m_max_${suffix}`]=[20];
  raw.daily[`temperature_2m_min_${suffix}`]=[10];
  raw.daily[`pressure_msl_mean_${suffix}`]=[dailyPressure.mean];
  raw.daily[`pressure_msl_min_${suffix}`]=[dailyPressure.min];
  raw.daily[`pressure_msl_max_${suffix}`]=[dailyPressure.max];
  raw.daily[`precipitation_sum_${suffix}`]=[0];
  raw.daily[`precipitation_probability_max_${suffix}`]=[0];
  raw.daily[`wind_speed_10m_max_${suffix}`]=[12];
  raw.daily[`wind_gusts_10m_max_${suffix}`]=[17];
  raw.daily[`wind_direction_10m_dominant_${suffix}`]=[180];
  raw.daily[`weather_code_${suffix}`]=[1];
  raw.daily[`sunrise_${suffix}`]=[`${date}T06:00`];
  raw.daily[`sunset_${suffix}`]=[`${date}T18:00`];
}

const forecast=normalizeBatchedForecast(raw,city,models,3);
assert.equal(isForecastPayloadValid(forecast,{cityId:city.id}),true);
for(const model of models){
  const series=forecast.seriesByModel[model.id];
  assert.deepEqual(series.hourly.pressureMsl,pressures[model.id],`${model.id}: hourly MSL pressure must stay aligned`);
  assert.deepEqual(series.daily.pressureMslMean,[daily[model.id].mean]);
  assert.deepEqual(series.daily.pressureMslMin,[daily[model.id].min]);
  assert.deepEqual(series.daily.pressureMslMax,[daily[model.id].max]);
  assert.equal(series.daily.completeness.pressure.length,1,'daily pressure completeness must be tracked');
}

const hourly=buildTimelinePoints(forecast,'HOURLY',new Date('2026-10-01T09:05:00Z'),{includeModelValues:true,hourlyHorizonHours:3});
assert.equal(hourly.length,3);
assert.ok(hourly.every(point=>Number.isFinite(point.pressureMslHpa)),'hourly timeline must expose central MSL pressure');
assert.equal(hourly[0].pressureMslMinAcrossModels,1010);
assert.equal(hourly[0].pressureMslMaxAcrossModels,1014);
assert.ok(hourly[0].pressureMslHpa>=1010&&hourly[0].pressureMslHpa<=1014,'central pressure must stay inside source range');
assert.ok(Number.isFinite(hourly[0].pressureAgreementPercent));
assert.ok(hourly[0].engineDetails.pressure?.interval,'pressure must expose forecast-engine uncertainty metadata');
assert.deepEqual(hourly[0].modelValues.map(row=>row.pressure).sort((a,b)=>a-b),[1010,1014]);

const dailyTimeline=buildTimelinePoints(forecast,'DAILY',new Date('2026-10-01T09:05:00Z'));
assert.equal(dailyTimeline.length,1);
assert.ok(dailyTimeline[0].pressureMslHpa>=1012&&dailyTimeline[0].pressureMslHpa<=1016,'daily central pressure must derive from native daily mean values');
assert.ok(dailyTimeline[0].pressureMslMinHpa>=1008&&dailyTimeline[0].pressureMslMinHpa<=1012,'daily minimum must use native provider aggregate');
assert.ok(dailyTimeline[0].pressureMslMaxHpa>=1016&&dailyTimeline[0].pressureMslMaxHpa<=1020,'daily maximum must use native provider aggregate');

const outOfRange=structuredClone(raw);
outOfRange.hourly[`pressure_msl_${models[0].apiKey}`][0]=1200;
outOfRange.daily[`pressure_msl_mean_${models[0].apiKey}`][0]=700;
const sanitized=normalizeBatchedForecast(outOfRange,city,models,3);
assert.equal(sanitized.seriesByModel.GFS.hourly.pressureMsl[0],null,'physically impossible hourly pressure must be rejected');
assert.equal(sanitized.seriesByModel.GFS.daily.pressureMslMean[0],null,'physically impossible daily pressure must be rejected');

const oldCached=structuredClone(forecast.seriesByModel.GFS);
delete oldCached.hourly.pressureMsl;
delete oldCached.daily.pressureMslMean;
delete oldCached.daily.pressureMslMin;
delete oldCached.daily.pressureMslMax;
delete oldCached.daily.completeness.pressure;
assert.deepEqual(forecastSeriesIssues(oldCached),[],'pre-pressure cached forecast series must remain backward compatible');

const invalid=structuredClone(forecast.seriesByModel.GFS);
invalid.hourly.pressureMsl[1]=1200;
assert.ok(forecastSeriesIssues(invalid).includes('HOURLY_pressureMsl_INVALID'));

console.log('MSL pressure normalization, safety, timeline and cache compatibility: OK');
