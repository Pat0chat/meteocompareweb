import assert from 'node:assert/strict';
import { forecastSeriesIssues, forecastPayloadIssues, isForecastPayloadValid, normalizeForecastPayload } from '../../../js/data/contracts.js';

const makeSeries = () => ({
  modelId:'GFS',
  hourly:{
    timestamps:['2026-08-24T12:00','2026-08-24T13:00'],
    timestampEpochMs:[Date.parse('2026-08-24T12:00:00Z'),Date.parse('2026-08-24T13:00:00Z')],
    temperature2m:[20,21], precipitation:[0,0.2], precipitationProbability:[10,40], cloudCover:[20,30],
    windSpeed10m:[15,16], windDirection10m:[180,190], windGusts10m:[25,27], weatherCode:[1,2]
  },
  daily:{
    dates:['2026-08-24'], tempMax:[24], tempMin:[14], precipitationSum:[0.2], precipitationProbabilityMax:[40],
    windSpeedMax:[16], windGustsMax:[27], windDirection10mDominant:[185], weatherCode:[2], sunrise:['2026-08-24T06:40'], sunset:['2026-08-24T20:45']
  }
});

const series = makeSeries();
assert.deepEqual(forecastSeriesIssues(series), []);
const misaligned = makeSeries(); misaligned.hourly.windSpeed10m = [12];
assert.ok(forecastSeriesIssues(misaligned).includes('HOURLY_windSpeed10m_MISALIGNED'));
const invalidPercent = makeSeries(); invalidPercent.hourly.precipitationProbability[1] = 101;
assert.ok(forecastSeriesIssues(invalidPercent).includes('HOURLY_precipitationProbability_INVALID'));
const backwardsEpoch = makeSeries(); backwardsEpoch.hourly.timestampEpochMs.reverse();
assert.ok(forecastSeriesIssues(backwardsEpoch).includes('HOURLY_timestampEpochMs_NOT_INCREASING'));
const impossibleTemperature = makeSeries(); impossibleTemperature.hourly.temperature2m[0] = 95;
assert.ok(forecastSeriesIssues(impossibleTemperature).includes('HOURLY_temperature2m_INVALID'));
const impossibleHourlyRain = makeSeries(); impossibleHourlyRain.hourly.precipitation[0] = 301;
assert.ok(forecastSeriesIssues(impossibleHourlyRain).includes('HOURLY_precipitation_INVALID'));
const impossibleWind = makeSeries(); impossibleWind.daily.windSpeedMax[0] = 301;
assert.ok(forecastSeriesIssues(impossibleWind).includes('DAILY_windSpeedMax_INVALID'));
const invalidWeatherCode = makeSeries(); invalidWeatherCode.daily.weatherCode[0] = 100;
assert.ok(forecastSeriesIssues(invalidWeatherCode).includes('DAILY_weatherCode_INVALID'));
const invertedTemperatureRange = makeSeries(); invertedTemperatureRange.daily.tempMin[0] = 26;
assert.ok(forecastSeriesIssues(invertedTemperatureRange).includes('DAILY_TEMPERATURE_PAIR_INVALID'));

const payload = {
  city:{id:'paris',name:'Paris',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris'}, timezone:'Europe/Paris',
  fetchedAt:'2026-08-24T10:00:00.000Z', seriesByModel:{GFS:makeSeries()}, modelMeta:{GFS:{runTimestamp:null}}, errors:{}, requestedModelIds:['GFS','GFS','UNKNOWN']
};
assert.equal(isForecastPayloadValid(payload,{cityId:'paris'}), true);
assert.deepEqual(forecastPayloadIssues(payload,{cityId:'lyon'}), ['CITY_ID_MISMATCH']);

const withUnknown = structuredClone(payload); withUnknown.seriesByModel.BAD = makeSeries();
assert.ok(forecastPayloadIssues(withUnknown).includes('MODEL_UNKNOWN:BAD'));
const normalized = normalizeForecastPayload(withUnknown,{cityId:'paris'});
assert.deepEqual(Object.keys(normalized.seriesByModel), ['GFS'], 'unknown model data must be removed during normalization');
assert.deepEqual(normalized.requestedModelIds, ['GFS']);

const partlyBroken = structuredClone(payload); partlyBroken.seriesByModel.ECMWF = makeSeries(); partlyBroken.seriesByModel.ECMWF.hourly.precipitation = [0];
const repaired = normalizeForecastPayload(partlyBroken,{cityId:'paris'});
assert.deepEqual(Object.keys(repaired.seriesByModel), ['GFS'], 'one corrupt model must not invalidate healthy model series');

const physicallyBroken = structuredClone(payload); physicallyBroken.seriesByModel.ECMWF = makeSeries(); physicallyBroken.seriesByModel.ECMWF.daily.precipitationSum[0] = 1001;
const physicallyRepaired = normalizeForecastPayload(physicallyBroken,{cityId:'paris'});
assert.deepEqual(Object.keys(physicallyRepaired.seriesByModel), ['GFS'], 'cache/import normalization must remove physically impossible model series');

assert.equal(normalizeForecastPayload({...payload,fetchedAt:'invalid'}), null);
assert.equal(normalizeForecastPayload({...payload,seriesByModel:{}}), null);
assert.equal(normalizeForecastPayload(payload,{cityId:'other'}), null);

console.log('Forecast payload validation and partial repair contracts: OK');
