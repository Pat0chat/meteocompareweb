import assert from 'node:assert/strict';
import { buildEvolution } from '../../../js/features/evolution.js';

const now=Date.parse('2026-09-03T12:00:00.000Z'),date='2026-09-04';
const daily=(temperature,precipitation,wind)=>({
  dates:[date],tempMax:[temperature],tempMin:[temperature-8],precipitationSum:[precipitation],
  windSpeedMax:[wind],windGustsMax:[wind+12],windDirection10mDominant:[180],
  precipitationProbabilityMax:[60],weatherCode:[2],sunrise:[null],sunset:[null],
});
const forecast={
  city:{timezone:'UTC'},fetchedAt:new Date(now).toISOString(),
  seriesByModel:{
    GFS:{daily:daily(20,2,24)},
    ECMWF:{daily:daily(24,4,30)},
    ICON_EU:{daily:daily(100,30,100)},
  },
};
const snapshots=[{
  capturedAt:now-24*3600e3,qualityVersion:2,
  daily:{[date]:{
    GFS:{temperature:18,precipitation:1,wind:20},
    ECMWF:{temperature:22,precipitation:3,wind:26},
  }},
}];

const report=buildEvolution(forecast,snapshots),temperature=report.days[0].variables.temperature;
assert.equal(temperature.currentMedian,22,'central evolution must keep the comparable-cohort median');
assert.equal(temperature.currentLow,20,'current spread must use only models also present in history');
assert.equal(temperature.currentHigh,24,'a current-only outlier must not inflate the comparable spread');
assert.equal(temperature.previous[0].median,20);
assert.equal(temperature.previous[0].low,18);
assert.equal(temperature.previous[0].high,22);
assert.equal(temperature.medianDelta,2,'adding spread diagnostics must not change revision calculation');
assert.equal(temperature.trend,'INCREASING','adding spread diagnostics must not change trend classification');
assert.equal(temperature.comparedModels,2);

console.log('Forecast evolution comparable-cohort dispersion: OK');
