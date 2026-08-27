import assert from 'node:assert/strict';
import { buildScenarios, roundedHourLocal } from '../../../js/domain.js';

const anchor=roundedHourLocal('UTC'),anchorMs=Date.parse(`${anchor}Z`);
const timestamps=Array.from({length:12},(_,i)=>new Date(anchorMs+i*3600e3).toISOString().slice(0,16));

function scenarioSeries(kind){
  const temperature2m=Array.from({length:12},(_,i)=>17+i*.8);
  const precipitation=Array(12).fill(0);
  const weatherCode=Array(12).fill(3);
  const cloudCover=Array(12).fill(88);
  const windGusts10m=Array(12).fill(30);
  if(kind==='rainMiddle') for(const i of [4,5,6]){precipitation[i]=.5;weatherCode[i]=61;}
  if(kind==='rainEarly') for(const i of [0,1,2]){precipitation[i]=1.7;weatherCode[i]=61;}
  if(kind==='showersLate') for(const i of [9,10]){precipitation[i]=.3;weatherCode[i]=80;}
  return {hourly:{timestamps,temperature2m,precipitation,weatherCode,cloudCover,windGusts10m}};
}

// Seven default-style models deliberately produce four coherent weather groups.
// ECMWF + AIFS share one numerical lineage, so scenario ranking is family-balanced.
const forecast={city:{timezone:'UTC'},seriesByModel:{
  AROME_FRANCE_HD:scenarioSeries('rainMiddle'),
  ARPEGE_EUROPE:scenarioSeries('rainMiddle'),
  ICON_EU:scenarioSeries('overcast'),
  GFS:scenarioSeries('overcast'),
  ECMWF:scenarioSeries('rainEarly'),
  ECMWF_AIFS:scenarioSeries('rainEarly'),
  UKMO_GLOBAL:scenarioSeries('showersLate'),
}};

const all=buildScenarios(forecast,Number.POSITIVE_INFINITY);
assert.equal(all.length,4,'four distinct type/timing groups must remain four real scenarios');
assert.deepEqual(all.map(s=>`${s.kind}|${s.timing}`),['RAIN|MIDDLE','OVERCAST|NONE','RAIN|EARLY','SHOWERS|LATE']);
assert.ok(all.every(s=>s.kind!=='OTHER'),'scenario builder must never synthesize a heterogeneous OTHER weather scenario');
assert.deepEqual(all[0].modelIds.sort(),['AROME_FRANCE_HD','ARPEGE_EUROPE'].sort(),'scenario membership should remain inspectable');
assert.equal(all[0].precipMin,1.5);
assert.equal(all[0].precipMax,1.5);
assert.equal(all[2].precipMin,5.1);
assert.equal(all[2].precipMax,5.1,'wetter early-rain group must keep its own precipitation range instead of contaminating a remainder bucket');

const limited=buildScenarios(forecast,3);
assert.equal(limited.length,3,'UI limit should select three coherent scenarios');
assert.ok(limited.every(s=>s.kind!=='OTHER'),'limiting the list must not merge omitted groups');
assert.equal(limited.at(-1).kind,'RAIN');
assert.equal(limited.at(-1).timing,'EARLY');
assert.equal(limited.at(-1).precipMax,5.1,'the third visible scenario should carry the actual wetter scenario and its icon/label');

console.log('12 h scenarios keep coherent model groups and never aggregate heterogeneous leftovers: OK');
