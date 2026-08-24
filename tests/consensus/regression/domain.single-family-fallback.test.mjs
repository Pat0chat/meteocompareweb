import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dayConfidence, hourlyConfidenceBand, aggregateDay, currentConditions } from '../../../js/domain.js';

const day='2026-08-20';
const timestamps=[`${day}T06:00`,`${day}T07:00`,`${day}T08:00`];
function series(temp,precip,prob,wind){
  return {
    hourly:{
      timestamps,
      temperature2m:[temp,temp+1,temp+2], precipitation:[precip,precip,precip], precipitationProbability:[prob,prob,prob],
      windSpeed10m:[wind,wind+1,wind+2], windGusts10m:[wind+8,wind+9,wind+10], windDirection10m:[180,180,180], cloudCover:[40,45,50], weatherCode:[1,1,1]
    },
    daily:{
      dates:[day], tempMax:[temp+5], tempMin:[temp-2], precipitationSum:[precip*3], windSpeedMax:[wind+2], windGustsMax:[wind+10],
      windDirection10mDominant:[180], precipitationProbabilityMax:[prob], weatherCode:[1], sunrise:[`${day}T05:45`], sunset:[`${day}T20:30`]
    }
  };
}

// ICON_EU and ICON_GLOBAL deliberately belong to the same independent Consensus v2 lineage.
const forecast={city:{id:'x',timezone:'UTC'},seriesByModel:{
  ICON_EU:series(20,0,20,18),
  ICON_GLOBAL:series(22,2,80,22)
}};

const conf=dayConfidence(forecast,day);
assert.equal(conf.tempMax.familyCount,1);
assert.equal(conf.tempMax.central,26,'central temperature must remain available with a single independent family');
assert.equal(conf.tempMax.percent,null,'convergence must remain unavailable with a single family');
assert.ok(conf.precipitation,'rain data must not disappear with a single family');
assert.equal(conf.precipitation.familyCount,1);
assert.equal(conf.precipitation.percent,null);
assert.equal(conf.precipitation.probabilityPercent,50);
assert.equal(conf.overallPercent,null);

const aggregate=aggregateDay(forecast,day);
assert.equal(aggregate.tempMax,26);
assert.equal(aggregate.precip,6,'central rain amount must remain available when the wet scenario reaches 50%');
assert.equal(aggregate.confidence.overallPercent,null);

const now=new Date('2026-08-20T06:10:00Z');
const current=currentConditions(forecast,now);
assert.equal(current.familyCount,1);
assert.equal(current.temperature,21,'current central value must survive unavailable convergence');

for(const metric of ['TEMPERATURE','WIND','PRECIPITATION']){
  const band=hourlyConfidenceBand(forecast,metric,3,now);
  assert.equal(band.length,3,`${metric} band must keep weather points with one family`);
  assert.ok(band.every(p=>Number.isFinite(p.meanValue)),`${metric} central values must stay finite`);
  assert.ok(band.every(p=>p.familyCount===1));
  assert.ok(band.every(p=>p.percent===null),`${metric} convergence must be unavailable, not fabricated`);
}

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
assert.match(app,/function renderPageBack\(\)/,'non-home navigation must expose a page-level back control');
assert.doesNotMatch(app,/class="topbar-back"/,'back control must no longer overlap the topbar');
assert.match(css,/\.page-back-shell\s*\{/,'page-level back control needs a stable layout container');
assert.match(css,/\.page-back-button\s*\{/,'page-level back control should have a visible text label');

console.log('tests/consensus/regression/domain.single-family-fallback.test.mjs: OK');
