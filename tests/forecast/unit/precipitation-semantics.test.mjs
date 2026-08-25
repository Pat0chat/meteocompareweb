import assert from 'node:assert/strict';
import fs from 'node:fs';
import { precipitationConsensus, RAIN_THRESHOLD_MM, isWetPrecipitation } from '../../../js/consensus.js';
import { forecastEnginePrecipitation } from '../../../js/forecast-engines.js';
import { aggregateDay, dayConfidence, inferCondition } from '../../../js/domain.js';

assert.equal(RAIN_THRESHOLD_MM, 0.1, 'rain occurrence threshold must be centralized at 0.1 mm');
assert.equal(isWetPrecipitation(0.099), false);
assert.equal(isWetPrecipitation(0.1), false, 'the PoP event definition is strictly > 0.1 mm');
assert.equal(isWetPrecipitation(0.1001), true);

const boundary = amount => forecastEnginePrecipitation([{ modelId: 'GFS', amount }]);
assert.equal(boundary(0.099).probabilityPercent, 0);
assert.equal(boundary(0.1).probabilityPercent, 0);
assert.equal(boundary(0.1001).probabilityPercent, 100);

const lightDeterministic = forecastEnginePrecipitation([
  { modelId: 'GFS', amount: 0.2 },
  { modelId: 'ECMWF', amount: 0.3 },
  { modelId: 'UKMO_GLOBAL', amount: 0.4 },
]);
assert.equal(lightDeterministic.source, 'MODEL_AGREEMENT');
assert.equal(lightDeterministic.probabilityPercent, 100);
assert.equal(lightDeterministic.centralAmountMm, 0.3);

const native = forecastEnginePrecipitation([
  { modelId: 'GFS', amount: 0.2, probability: 70 },
  { modelId: 'ECMWF', amount: 0.3, probability: 80 },
  { modelId: 'UKMO_GLOBAL', amount: 0.4, probability: 90 },
]);
assert.equal(native.source, 'PROBABILITY');
assert.equal(native.probabilityPercent, 80, 'native PoP must stay probabilistic instead of becoming deterministic agreement');

const mixed = forecastEnginePrecipitation([
  { modelId: 'GFS', amount: 0.2, probability: 70 },
  { modelId: 'ECMWF', amount: 0.3 },
  { modelId: 'UKMO_GLOBAL', amount: 0.4, probability: 90 },
]);
assert.equal(mixed.source, 'MIXED');

const probabilityWithoutAmount = forecastEnginePrecipitation([
  { modelId: 'GFS', amount: null, probability: 80 },
]);
assert.equal(probabilityWithoutAmount.probabilityPercent, 80);
assert.equal(probabilityWithoutAmount.conditionalAmountMm, null);
assert.equal(probabilityWithoutAmount.centralAmountMm, null, 'missing amount must stay unknown');
assert.equal(probabilityWithoutAmount.expectedAmountMm, null, 'expected amount cannot be fabricated without an amount');

const consensusWithoutAmount = precipitationConsensus([
  { modelId: 'GFS', amount: null, probability: 80 },
]);
assert.equal(consensusWithoutAmount.centralAmountMm, null);
assert.equal(consensusWithoutAmount.expectedAmountMm, null);

assert.equal(inferCondition(0.1, 10, null), null, 'exactly 0.1 mm must not trigger a precipitation fallback condition');
assert.equal(inferCondition(0.1001, 10, null), 'DRIZZLE');

function dailySeries(amount, probability = null) {
  return {
    hourly: { timestamps: [], temperature2m: [], precipitation: [], precipitationProbability: [], cloudCover: [], windSpeed10m: [], windGusts10m: [], weatherCode: [] },
    daily: {
      dates: ['2026-08-26'], tempMin: [12], tempMax: [22], precipitationSum: [amount], precipitationProbabilityMax: [probability],
      windSpeedMax: [20], windGustsMax: [30], windDirection10mDominant: [180], weatherCode: [null], sunrise: [null], sunset: [null],
      completeness: { temperature: [{ status: 'FULL' }], precipitation: [{ status: 'FULL' }], wind: [{ status: 'FULL' }], condition: [{ status: 'FULL' }] },
    },
  };
}
const dailyForecast = { city: { timezone: 'UTC' }, seriesByModel: {
  GFS: dailySeries(0.2), ECMWF: dailySeries(0.3), UKMO_GLOBAL: dailySeries(0.4),
} };
const daily = aggregateDay(dailyForecast, '2026-08-26');
assert.equal(daily.precipProbability, 100, 'daily deterministic fallback must use the same weak-rain threshold');
assert.equal(dayConfidence(dailyForecast, '2026-08-26').precipitation.probabilityPercent, 100);

const app = fs.readFileSync(new URL('../../../js/app.js', import.meta.url), 'utf8');
const domain = fs.readFileSync(new URL('../../../js/domain.js', import.meta.url), 'utf8');
assert.match(app, /const fw=isWetPrecipitation\(x\.forecast\),ow=isWetPrecipitation\(x\.observation\)/, 'local reliability rain diagnostics must use the shared threshold');
assert.match(domain, /samples\.filter\(x=>isWetPrecipitation\(x\.precip\)\|\|WET\.has\(x\.condition\)\)/, '12 h scenarios must use the shared threshold');

console.log(`RAIN_SMOKE_OK native=${native.probabilityPercent}% light=${lightDeterministic.probabilityPercent}% amount=${lightDeterministic.centralAmountMm}`);
console.log(`RAIN_BOUNDARY_OK 0.099=${boundary(0.099).probabilityPercent} 0.1=${boundary(0.1).probabilityPercent} 0.1001=${boundary(0.1001).probabilityPercent}`);
