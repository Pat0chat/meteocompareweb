import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const consensus=read('js/consensus.js');
const domain=read('js/domain.js');
const app=read('js/app.js');

assert.match(consensus,/export function weatherConditionConsensus\(/,'hierarchical condition consensus must remain a dedicated public domain primitive');
assert.match(consensus,/weatherPhenomenonGroup/,'condition consensus must resolve broad phenomenon groups before subtypes');
assert.match(consensus,/weightedOrdinalCondition/,'ordered condition families must use an ordinal resolver rather than severity voting');

assert.match(domain,/function resolveAggregateCondition\(/,'aggregate condition provenance must be resolved in one shared domain path');
assert.match(domain,/const voteFor=list=>weatherConditionConsensus\(/,'aggregate native/inferred categorical inputs must still use the hierarchical consensus primitive');
assert.match(domain,/if\(nativeVote\.value&&\(nativeVote\.familyCount>=2\|\|usable\.length===1\)\)/,'multi-family native weather codes must be preferred before any aggregate-variable fallback');
assert.match(domain,/const derived=inferCondition\(precipitation,temperature,cloud\)/,'when native categorical coverage is insufficient the final condition must be derived once from central consensus variables');
assert.doesNotMatch(domain,/weightedVote\(/,'domain condition synthesis must never fall back to the legacy flat categorical vote');

assert.match(app,/now=currentConditions\(f,new Date\(\),engineContext\)[\s\S]*day=cachedAggregateDay\(f,today,engineContext\)/,'Home current/daily condition must come from the domain synthesis paths');
assert.match(app,/function homeTimelinePoints\(f,forecastOptions,maxPoints=5,now=new Date\(\)\)\{\s*return selectRegularTimelinePoints\(buildTimelinePoints\(f,'HOURLY'/,'Home mini-timeline must consume the hierarchical timeline builder');
assert.match(app,/agg=cachedAggregateDay\(f,today,engineContext\),now=currentConditions\(f,new Date\(\),engineContext\)/,'City Details hero/today summary must use the same current and daily condition synthesis as Home');
assert.match(app,/hourlyAll=buildTimelinePoints\(f,'HOURLY'[\s\S]*dailyAll=buildTimelinePoints\(f,'DAILY'/,'City Details chronology must use the shared hierarchical timeline builder in both hourly and daily modes');
assert.match(app,/matrix=Object\.fromEntries\(FORECAST_ENGINES\.map\(engine=>\[engine,Object\.fromEntries\(dates\.map\(date=>\[date,cachedAggregateDay\(f,date,contexts\[engine\]\)\]\)\)\]\)\)/,'Forecast-engine comparison must obtain conditions through aggregateDay rather than a separate categorical path');

assert.match(app,/condition:dailyCondition\(s,date\)\.condition/,'per-model daily tables may display a model-specific condition and must not be mistaken for the central consensus');
assert.match(app,/const x=hourlyCondition\(s,i\)/,'per-model hourly tables may display the raw/inferred condition of that individual model');

console.log('Hierarchical condition consensus routing across Home, Details, timelines and engine comparison: OK');
