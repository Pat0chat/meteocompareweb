import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeBatchedForecast } from '../js/api.js';
import { getModel } from '../js/models.js';

const city={id:'paris',name:'Paris',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris'};
const model=getModel('ICON_D2');
const time=Array.from({length:48},(_,i)=>new Date(Date.parse('2026-08-18T09:00:00Z')+i*3600e3).toISOString().slice(0,16));
const values=(limit,fn)=>Array.from({length:48},(_,i)=>i<limit?fn(i):null);
const raw={timezone:'Europe/Paris',hourly:{time,
  temperature_2m:values(24,i=>17+i/10),
  precipitation:values(30,()=>0),
  wind_speed_10m:values(32,()=>14),
  weather_code:values(47,()=>1),
}};
const f=normalizeBatchedForecast(raw,city,[model],48),meta=f.modelMeta.ICON_D2;
assert.equal(meta.coverageByVariable.temperature.lastTimestamp,time[23],'temperature coverage must end at its last real temperature point');
assert.equal(meta.coverageByVariable.precipitation.lastTimestamp,time[29],'precipitation coverage must be independent');
assert.equal(meta.coverageByVariable.wind.lastTimestamp,time[31],'wind coverage must be independent');
assert.equal(meta.coverageByVariable.conditions.lastTimestamp,time[46],'condition coverage may extend farther without extending temperature coverage');
assert.equal(meta.lastTimestamp,time[23],'generic useful coverage must stop where all critical numerical variables are still available');

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
assert.match(app,/modelCoverageKey\(tab\)/,'table metadata must choose coverage from the selected variable');
assert.match(app,/meta\.coverageByVariable\?\.\[key\]/,'table coverage must use per-variable metadata');
assert.doesNotMatch(app,/t\('runExactUnavailable'\)/,'unknown exact run must not be rendered as repetitive table text');
assert.match(app,/runAge!=null\?`\$\{t\('runAge'/,'known provider run timestamps may still be shown when actually exposed');
console.log('MeteoCompare Web variable run/coverage metadata tests: OK');
