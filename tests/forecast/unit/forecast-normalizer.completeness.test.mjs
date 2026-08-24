import assert from 'node:assert/strict';
import { sanitizeIncompleteFutureDaily } from '../../../js/data/forecast-normalizer.js';

const dates=['2026-08-24','2026-08-25','2026-08-26','2026-08-27'];
const timestamps=[];
for(const date of dates.slice(0,3)) for(let hour=0;hour<24;hour++) timestamps.push(`${date}T${String(hour).padStart(2,'0')}:00`);
const size=timestamps.length;
const full=Array(size).fill(1);
const precipitation=Array(size).fill(0);
const wind=Array(size).fill(10);
const condition=Array(size).fill(1);
// Future day 2: partial temperature; day 3: precipitation unavailable.
for(let i=24+12;i<48;i++) full[i]=null;
for(let i=48;i<72;i++) precipitation[i]=null;

const series={
  hourly:{timestamps,temperature2m:full,precipitation,windSpeed10m:wind,weatherCode:condition},
  daily:{dates:[...dates]}
};
const result=sanitizeIncompleteFutureDaily(series);
assert.equal(result,series,'sanitizer should annotate the existing normalized series');
assert.equal(series.daily.completeness.temperature[0].status,'CURRENT');
assert.equal(series.daily.completeness.temperature[1].status,'PARTIAL');
assert.equal(series.daily.completeness.wind[1].status,'FULL');
assert.equal(series.daily.completeness.precipitation[2].status,'UNAVAILABLE');
assert.equal(series.daily.completeness.condition[2].status,'FULL');
assert.equal(series.daily.completeness.temperature[3].status,'UNKNOWN','a daily row without hourly axis must be explicitly unknown');
assert.equal(series.daily.completeness.temperature[1].expectedHours,24);
assert.equal(series.daily.completeness.temperature[1].availableHours,12);

const untouched={hourly:{timestamps:[]},daily:{dates:['2026-08-24']}};
assert.equal(sanitizeIncompleteFutureDaily(untouched),untouched);
assert.equal(untouched.daily.completeness,undefined);

console.log('Future daily completeness annotations: OK');
