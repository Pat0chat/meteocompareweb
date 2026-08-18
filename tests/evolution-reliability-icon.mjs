import assert from 'node:assert/strict';
import { fetchForecast } from '../js/api.js';
import { webTranslationAudit } from '../js/i18n.js';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../js/api.js',import.meta.url),'utf8');

assert.match(api,/searchParams\.set\('forecast_hours', String\(maxDays \* 24\)\)/,'hourly API requests must use a rolling forecast_hours window');
assert.match(api,/usable<18[\s\S]*fetchSingleModelHourly\(city,iconD2\)/,'ICON-D2 must have a targeted fallback when a batched hourly series is suspiciously short');
assert.match(app,/class="evolution-table-head"/,'forecast evolution must use one analytical matrix instead of a card grid');
assert.match(app,/data-evolution-variable=/,'forecast evolution must allow switching variable without multiplying cards');
assert.match(app,/class="evolution-track"/,'forecast evolution must render revision trajectories');
assert.doesNotMatch(app,/class="evolution-grid"/,'legacy evolution card grid must be removed');
assert.match(app,/class="reliability-rank-row"/,'local reliability must use compact ranking rows');
assert.match(app,/data-reliability-variable=/,'local reliability must use variable tabs');
assert.match(app,/reliability\.score/,'local reliability compact ranking must expose the local score');
assert.match(css,/\.evolution-row \{ display:grid/,'evolution rows must be aligned as a desktop analysis matrix');
assert.match(css,/\.reliability-table-head,\.reliability-rank-row/,'local reliability must use a compact table-like layout');

// Simulate the precise ICON-D2 failure mode: the multi-model response contains
// only 3 temperature hours for ICON-D2, while the targeted fallback returns 48.
const city={id:'strasbourg',name:'Strasbourg',latitude:48.5734,longitude:7.7521,timezone:'Europe/Paris'};
const batchedTimes=Array.from({length:48},(_,i)=>`2026-08-${String(18+Math.floor(i/24)).padStart(2,'0')}T${String(i%24).padStart(2,'0')}:00`);
const batched={timezone:'Europe/Paris',hourly:{time:batchedTimes,
  temperature_2m_icon_d2:batchedTimes.map((_,i)=>i<3?20+i:null),
  temperature_2m_ncep_gfs_seamless:batchedTimes.map((_,i)=>19+i/10),
  precipitation_icon_d2:batchedTimes.map(()=>0),precipitation_ncep_gfs_seamless:batchedTimes.map(()=>0),
  wind_speed_10m_icon_d2:batchedTimes.map((_,i)=>i<3?10:null),wind_speed_10m_ncep_gfs_seamless:batchedTimes.map(()=>12),
  weather_code_icon_d2:batchedTimes.map((_,i)=>i<3?1:null),weather_code_ncep_gfs_seamless:batchedTimes.map(()=>1)
}};
const fallback={timezone:'Europe/Paris',hourly:{time:batchedTimes,
  temperature_2m:batchedTimes.map((_,i)=>20+i/20),precipitation:batchedTimes.map(()=>0),wind_speed_10m:batchedTimes.map(()=>10),weather_code:batchedTimes.map(()=>1)
}};
const urls=[];globalThis.fetch=async url=>{urls.push(String(url));return {ok:true,json:async()=>urls.length===1?batched:fallback};};
const f=await fetchForecast(city,['ICON_D2','GFS'],7);
assert.equal(urls.length,2,'a short ICON-D2 batched series should trigger one and only one targeted fallback');
assert.match(urls[0],/forecast_hours=168/,'the main 7-day request must expose 168 rolling hourly slots');
assert.match(urls[1],/models=icon_d2/,'fallback must request ICON-D2 alone');
assert.match(urls[1],/forecast_hours=48/,'ICON-D2 fallback must request its documented 48-hour horizon');
assert.equal(f.seriesByModel.ICON_D2.hourly.temperature2m.filter(Number.isFinite).length,48,'the longer ICON-D2 fallback must replace the short batched hourly series');
assert.equal(f.modelMeta.ICON_D2.fallbackHourly,true,'fallback provenance must be retained in model metadata');

for(const [lang,missing] of Object.entries(webTranslationAudit()))assert.deepEqual(missing,[],`missing web translations for ${lang}`);
console.log('MeteoCompare Web ICON-D2 + evolution + reliability tests: OK');
