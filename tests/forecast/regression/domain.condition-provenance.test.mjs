import assert from 'node:assert/strict';
import fs from 'node:fs';
import { currentConditions, aggregateDay, buildTimelinePoints } from '../../../js/domain.js';

const day='2026-08-27',timestamp=`${day}T12:00`;
function series({code=null,cloud=50,precip=0,prob=10,temp=20}={}){return {
  hourly:{timestamps:[timestamp],temperature2m:[temp],precipitation:[precip],precipitationProbability:[prob],cloudCover:[cloud],windSpeed10m:[8],windGusts10m:[14],weatherCode:[code]},
  daily:{dates:[day],tempMin:[temp-5],tempMax:[temp+3],precipitationSum:[precip],precipitationProbabilityMax:[prob],windSpeedMax:[10],windGustsMax:[16],windDirection10mDominant:[180],weatherCode:[code],sunrise:[null],sunset:[null]},
};}

// Two independent native-code families must win over a heuristic fallback from another model.
const nativeForecast={city:{timezone:'UTC'},seriesByModel:{
  GFS:series({code:0,cloud:5}),
  ECMWF:series({code:1,cloud:20}),
  ICON_EU:series({code:null,cloud:95,precip:6,prob:90}),
}};
const now=currentConditions(nativeForecast,new Date(`${day}T12:05:00Z`));
assert.equal(now.conditionSource,'MODEL_CODE_CONSENSUS');
assert.equal(now.conditionInferred,false);
assert.equal(now.conditionNativeModelCount,2);
assert.equal(now.conditionDerivedModelCount,1);
assert.notEqual(now.condition,'RAIN','an inferred model fallback must not override a multi-family native categorical consensus');
const daily=aggregateDay(nativeForecast,day);
assert.equal(daily.conditionSource,'MODEL_CODE_CONSENSUS');
const nativeTimeline=buildTimelinePoints(nativeForecast,'HOURLY',new Date(`${day}T11:35:00Z`));
assert.equal(nativeTimeline[0]?.conditionSource,'MODEL_CODE_CONSENSUS');

// With no native weather codes, derive the aggregate condition once from central consensus variables.
const derivedForecast={city:{timezone:'UTC'},seriesByModel:{
  GFS:series({code:null,cloud:24,temp:19}),
  ECMWF:series({code:null,cloud:32,temp:21}),
  ICON_EU:series({code:null,cloud:28,temp:20}),
}};
const derived=currentConditions(derivedForecast,new Date(`${day}T12:05:00Z`));
assert.equal(derived.conditionSource,'CONSENSUS_VARIABLES');
assert.equal(derived.conditionInferred,true);
assert.equal(derived.conditionNativeModelCount,0);
assert.equal(derived.conditionDerivedModelCount,3);
const derivedTimeline=buildTimelinePoints(derivedForecast,'HOURLY',new Date(`${day}T11:35:00Z`));
assert.equal(derivedTimeline[0]?.conditionSource,'CONSENSUS_VARIABLES');

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
assert.match(app,/function aggregateConditionMarkup\(/,'aggregate condition icons need their own provenance-aware renderer');
assert.match(app,/conditionConsensusVariables/,'aggregate fallback provenance must say it comes from consensus variables');
assert.match(app,/aggregateConditionMarkup\(p,'small'\)/,'timeline must render aggregate consensus provenance, not single-model inferred provenance');
assert.doesNotMatch(app,/conditionMarkup\(p\.condition,'small',Boolean\(p\.conditionInferred\)\)/,'timeline must not label an aggregate condition as inferred from the same model');
assert.match(app,/conditionMarkup\(x\.condition,'small',x\.inferred\)/,'single-model detailed tables must keep the true same-model inference marker');
console.log('Aggregate weather-condition provenance and fallback hierarchy: OK');
