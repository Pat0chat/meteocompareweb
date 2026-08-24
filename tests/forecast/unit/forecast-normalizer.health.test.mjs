import assert from 'node:assert/strict';
import { hourlySeriesHealth } from '../../../js/data/forecast-normalizer.js';

const timestamps = Array.from({length:48},(_,i)=>`2026-08-${String(24+Math.floor(i/24)).padStart(2,'0')}T${String(i%24).padStart(2,'0')}:00`);
const full = value => Array(48).fill(value);
const model = { horizonHours:168 };
let health = hourlySeriesHealth({hourly:{timestamps,temperature2m:full(20),precipitation:full(0),windSpeed10m:full(10)}},model,48);
assert.equal(health.expected,48);
assert.equal(health.alignedCount,48);
assert.equal(health.degraded,false);
assert.equal(health.ratio,1);
assert.equal(health.internalGaps,0);

const short = Array(48).fill(null); for(let i=0;i<10;i++) short[i]=1;
health = hourlySeriesHealth({hourly:{timestamps,temperature2m:short,precipitation:short,windSpeed10m:short}},model,48);
assert.equal(health.severeShort,true);
assert.equal(health.degraded,true);

const imbalanced = { temperature2m:full(20), precipitation:full(0), windSpeed10m:Array(48).fill(null) };
for(let i=0;i<20;i++) imbalanced.windSpeed10m[i]=10;
health = hourlySeriesHealth({hourly:{timestamps,...imbalanced}},model,48);
assert.equal(health.variableImbalance,true);
assert.equal(health.sparseCritical,true);
assert.equal(health.degraded,true);

const fragmented = { temperature2m:full(20), precipitation:full(0), windSpeed10m:full(10) };
for(const i of [5,10,15,20,25,30]) for(const key of Object.keys(fragmented)) fragmented[key][i]=null;
health = hourlySeriesHealth({hourly:{timestamps,...fragmented}},model,48);
assert.equal(health.fragmented,true);
assert.ok(health.internalGaps>=6);

const regional = hourlySeriesHealth({hourly:{timestamps:timestamps.slice(0,24),temperature2m:full(20).slice(0,24),precipitation:full(0).slice(0,24),windSpeed10m:full(10).slice(0,24)}},{horizonHours:48},48);
assert.equal(regional.shortRegional,true);
assert.equal(regional.expected,48);
assert.ok(regional.minimum<=24, 'short regional models must use a horizon-aware minimum');

console.log('Hourly forecast health degradation detection: OK');
