import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hourlyCondition, dailyCondition, currentConditions, aggregateDay, buildTimelinePoints } from '../../../js/domain.js';

function series({nativeHourly=false,nativeDaily=false}={}){
  return {
    hourly:{
      timestamps:['2026-08-18T12:00','2026-08-18T13:00'],
      temperature2m:[20,21], precipitation:[0,0], precipitationProbability:[10,10], cloudCover:[18,22],
      windSpeed10m:[8,9], windGusts10m:[14,15], weatherCode:[nativeHourly?1:null,nativeHourly?1:null]
    },
    daily:{
      dates:['2026-08-18'],tempMin:[14],tempMax:[23],precipitationSum:[0],precipitationProbabilityMax:[10],windSpeedMax:[12],windGustsMax:[20],windDirection10mDominant:[180],weatherCode:[nativeDaily?1:null],sunrise:[null],sunset:[null]
    },
    completeness:{temperature:[24],precipitation:[24],wind:[24],condition:[24]}
  };
}

const inferred=series();
const direct=series({nativeHourly:true,nativeDaily:true});
assert.deepEqual(hourlyCondition(inferred,0),{condition:'MAINLY_CLEAR',inferred:true});
assert.deepEqual(hourlyCondition(direct,0),{condition:'MAINLY_CLEAR',inferred:false});
assert.equal(dailyCondition(inferred,'2026-08-18').inferred,true);
assert.equal(dailyCondition(direct,'2026-08-18').inferred,false);

const city={timezone:'Europe/Paris'};
const inferredForecast={city,seriesByModel:{A:inferred}};
const directForecast={city,seriesByModel:{A:direct}};
assert.equal(currentConditions(inferredForecast,new Date('2026-08-18T10:05:00Z')).conditionInferred,true);
assert.equal(currentConditions(directForecast,new Date('2026-08-18T10:05:00Z')).conditionInferred,false);
assert.equal(aggregateDay(inferredForecast,'2026-08-18').conditionInferred,true);
assert.equal(aggregateDay(directForecast,'2026-08-18').conditionInferred,false);
const timeline=buildTimelinePoints(inferredForecast,'HOURLY',new Date('2026-08-18T10:05:00Z'));
assert.ok(timeline.length>0);
assert.equal(timeline[0].conditionInferred,true);

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
assert.match(app,/condition-icon \$\{inferred\?'is-inferred':''\}/,'condition markup must visibly distinguish inferred conditions');
assert.match(app,/hourlyCondition\(s,i\)/,'hourly detailed conditions must infer and flag missing native codes');
assert.match(app,/conditionMarkup\(x\.condition,'small',x\.inferred\)/,'daily detailed conditions must pass inferred state to the icon');
assert.match(css,/\.condition-icon\.is-inferred[^{]*\{[^}]*outline:/s,'inferred icon must have a distinct outline');
assert.doesNotMatch(app,/t\('inferred'\)/,'no visible inferred text label should be rendered');
assert.doesNotMatch(app,/condition-inferred-mark/,'no extra inferred marker should be rendered');
assert.doesNotMatch(css,/\.condition-inferred-mark/,'no extra inferred marker style should remain');
console.log('MeteoCompare Web inferred condition icon tests: OK');
