import assert from 'node:assert/strict';
import {
  forecastEngineContinuous,
  forecastEnginePrecipitation,
} from '../../../js/forecast-engines.js';
import { buildTimelinePoints, hourlyConfidenceBand } from '../../../js/domain.js';
import { APP_VERSION } from '../../../js/version.js';

const entries = values => values.map(([modelId, value]) => ({ modelId, value }));
const input = entries([
  ['ARPEGE_EUROPE', 18],
  ['ICON_EU', 18.5],
  ['GFS', 19],
  ['ECMWF', 19.2],
  ['UKMO_GLOBAL', 27],
]);

// Engine results must not depend on input order and must never mutate caller-owned rows.
const snapshot = structuredClone(input);
const forward = forecastEngineContinuous(input, { engine: 'MULTI_CONSENSUS', tight: 0.5, wide: 3 });
const reverse = forecastEngineContinuous([...input].reverse(), { engine: 'MULTI_CONSENSUS', tight: 0.5, wide: 3 });
assert.equal(forward.central, reverse.central, 'forecast engine must be order invariant');
assert.deepEqual(input, snapshot, 'forecast engine must not mutate source rows');
assert.ok(forward.interval.low <= forward.central && forward.central <= forward.interval.high);

// Calibration is deliberately shrunk with short histories instead of applying 100% of a noisy bias.
const calibrationEntries = entries([
  ['GFS', 20],
  ['ECMWF', 20],
  ['UKMO_GLOBAL', 20],
]);
const profile = sampleSize => Object.fromEntries(calibrationEntries.map(({ modelId }) => [
  modelId,
  { bias: 3, score: 80, standardDeviation: 1, meanAbsoluteError: 0.8, sampleSize },
]));
const shortHistory = forecastEngineContinuous(calibrationEntries, {
  engine: 'CALIBRATION', calibration: profile(14), tight: 0.5, wide: 3,
});
const matureHistory = forecastEngineContinuous(calibrationEntries, {
  engine: 'CALIBRATION', calibration: profile(30), tight: 0.5, wide: 3,
});
assert.equal(shortHistory.fallback, false);
assert.ok(shortHistory.calibrationStrength > 0 && shortHistory.calibrationStrength < 1);
assert.equal(matureHistory.calibrationStrength, 1);
assert.ok(shortHistory.central > 17 && shortHistory.central < 20, '14 samples must only partially correct a 3°C bias');
assert.ok(matureHistory.central < shortHistory.central, 'a mature history may apply more of the measured bias');

// Two calibrated sibling models still count as one independent family and must not unlock calibration alone.
const siblingCalibration = {
  ICON_EU: { bias: 2, score: 90, standardDeviation: 1, meanAbsoluteError: 0.8, sampleSize: 40 },
  ICON_GLOBAL: { bias: 2, score: 90, standardDeviation: 1, meanAbsoluteError: 0.8, sampleSize: 40 },
};
const siblingResult = forecastEngineContinuous(entries([
  ['ICON_EU', 20], ['ICON_GLOBAL', 20.5], ['GFS', 21],
]), { engine: 'CALIBRATION', calibration: siblingCalibration, tight: 0.5, wide: 3 });
assert.equal(siblingResult.fallback, true);
assert.equal(siblingResult.calibratedFamilyCount, 1);
assert.equal(siblingResult.effectiveEngine, 'MULTI_CONSENSUS');

// A unimodal distribution must transparently report a scenarios -> multi-consensus fallback.
const singleScenario = forecastEngineContinuous(entries([
  ['ARPEGE_EUROPE', 18], ['ICON_EU', 18.2], ['GFS', 18.4], ['ECMWF', 18.6],
]), { engine: 'SCENARIOS', tight: 0.5, wide: 3 });
assert.equal(singleScenario.scenarioCount, 1);
assert.equal(singleScenario.fallback, true);
assert.equal(singleScenario.fallbackReason, 'SINGLE_SCENARIO');
assert.equal(singleScenario.effectiveEngine, 'MULTI_CONSENSUS');

const precipitation = forecastEnginePrecipitation([
  { modelId: 'GFS', amount: 0, probability: 15 },
  { modelId: 'ECMWF', amount: 8, probability: 85 },
  { modelId: 'UKMO_GLOBAL', amount: 6, probability: 70 },
], { engine: 'ADAPTIVE' });
assert.ok(precipitation.probabilityPercent >= 0 && precipitation.probabilityPercent <= 100);
assert.ok(precipitation.centralAmountMm >= 0);

function series(tempMax, precip, wind, probability = 50) {
  const timestamps = ['2026-08-22T18:00', '2026-08-22T19:00', '2026-08-22T20:00'];
  return {
    hourly: {
      timestamps,
      temperature2m: timestamps.map((_, index) => tempMax - 1 + index * 0.2),
      precipitation: timestamps.map(() => precip / 24),
      precipitationProbability: timestamps.map(() => probability),
      cloudCover: timestamps.map(() => 40),
      windSpeed10m: timestamps.map(() => wind),
      windGusts10m: timestamps.map(() => wind + 8),
      windDirection10m: timestamps.map(() => 180),
      weatherCode: timestamps.map(() => 2),
    },
    daily: {
      dates: ['2026-08-22'],
      tempMin: [tempMax - 10],
      tempMax: [tempMax],
      precipitationSum: [precip],
      precipitationProbabilityMax: [probability],
      windSpeedMax: [wind],
      windGustsMax: [wind + 8],
      windDirection10mDominant: [180],
      weatherCode: [2],
      sunrise: ['2026-08-22T06:30'],
      sunset: ['2026-08-22T20:30'],
      completeness: {
        temperature: [{ status: 'FULL' }], precipitation: [{ status: 'FULL' }],
        wind: [{ status: 'FULL' }], condition: [{ status: 'FULL' }],
      },
    },
  };
}

const forecast = { city: { timezone: 'UTC' }, seriesByModel: {
  ARPEGE_EUROPE: series(17, 1, 18, 35),
  ICON_EU: series(17.5, 2, 20, 45),
  GFS: series(18, 3, 22, 55),
  ECMWF: series(18.2, 3.5, 23, 60),
  UKMO_GLOBAL: series(24, 10, 35, 85),
  GEM_GLOBAL: series(24.5, 11, 37, 88),
} };
const calibration = Object.fromEntries(Object.keys(forecast.seriesByModel).map(modelId => [modelId, {
  bias: modelId.startsWith('UKMO') || modelId.startsWith('GEM') ? 4 : 0.5,
  score: 80, standardDeviation: 1, meanAbsoluteError: 0.8, sampleSize: 30,
}]));
const options = engine => ({
  forecastEngine: engine,
  weightsByVariable: {},
  calibrationByVariable: { temperature: calibration, wind: calibration, precipitation: calibration },
});

// Agreement indicators describe the raw model population and must not move when the selected forecast engine changes.
const baselineTimeline = buildTimelinePoints(forecast, 'DAILY', new Date('2026-08-22T17:00:00Z'), options('MULTI_CONSENSUS'));
for (const engine of ['CALIBRATION', 'SCENARIOS', 'ADAPTIVE']) {
  const timeline = buildTimelinePoints(forecast, 'DAILY', new Date('2026-08-22T17:00:00Z'), options(engine));
  assert.deepEqual(
    timeline.map(point => point.convergencePercent),
    baselineTimeline.map(point => point.convergencePercent),
    `${engine} must not alter raw timeline convergence`,
  );
}

const baselineBand = hourlyConfidenceBand(forecast, 'TEMPERATURE', 3, new Date('2026-08-22T17:10:00Z'), options('MULTI_CONSENSUS'));
for (const engine of ['CALIBRATION', 'SCENARIOS', 'ADAPTIVE']) {
  const band = hourlyConfidenceBand(forecast, 'TEMPERATURE', 3, new Date('2026-08-22T17:10:00Z'), options(engine));
  assert.deepEqual(
    band.map(point => point.percent),
    baselineBand.map(point => point.percent),
    `${engine} must not alter raw hourly agreement`,
  );
}

console.log(`MeteoCompare ${APP_VERSION} forecast-engine audit: OK`);
