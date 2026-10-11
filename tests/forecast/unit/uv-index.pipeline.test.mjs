import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeUvForecast, uvForTimestamp, uvMaxForDate, uvLevel } from '../../../js/uv.js';
import { normalizeBatchedForecast } from '../../../js/data/forecast-normalizer.js';
import { normalizeForecastPayload } from '../../../js/data/contracts.js';
import { buildTimelinePoints } from '../../../js/domain.js';
import { getModel } from '../../../js/models.js';

const uv = normalizeUvForecast({
  hourly:{time:['2026-10-11T09:00','2026-10-11T10:00','2026-10-11T11:00'],uv_index:[2.4,6.8,99]},
  daily:{time:['2026-10-11','2026-10-12'],uv_index_max:[7.1,12.2]},
});
assert.equal(uv.hourly.uvIndex[0],2.4);
assert.equal(uv.hourly.uvIndex[2],null,'impossible UV must be discarded');
assert.equal(uvMaxForDate({uv},'2026-10-11'),7.1);
assert.equal(uvForTimestamp({uv},'2026-10-11T10:00'),6.8);
assert.equal(uvForTimestamp({uv},'2026-10-11T14:00'),null,'missing hourly UV is not interpolated');
assert.equal(uvMaxForDate({uv},'2026-10-13'),null);
assert.equal(uvMaxForDate({uv:{hourly:uv.hourly}},'2026-10-11'),6.8,'hourly-only feeds can support a partial daily max');
assert.equal(normalizeUvForecast({hourly:{time:['2026-10-11T09:00'],uv_index:[-4]}}),null);
assert.equal(normalizeUvForecast({daily:{time:['2026-10-11'],uv_index_max:[NaN]}}),null);
for(const [index,level] of [[0,'low'],[3,'moderate'],[6,'high'],[8,'very-high'],[11,'extreme'],[null,'unavailable']])assert.equal(uvLevel(index),level);

const model=getModel('GFS'),city={id:'uv-city',name:'UV city',latitude:48.86,longitude:2.35,timezone:'UTC'},times=uv.hourly.timestamps,date='2026-10-11';
const raw={timezone:'UTC',hourly:{time:times},daily:{time:[date]}};
for(const [key,vals] of Object.entries({temperature_2m:[15,16,17],precipitation:[0,0,0],wind_speed_10m:[12,12,12]}))raw.hourly[key]=vals;
for(const [key,vals] of Object.entries({temperature_2m_max:[19],temperature_2m_min:[12],precipitation_sum:[0],wind_speed_10m_max:[16],weather_code:[1]}))raw.daily[key]=vals;
const forecast=normalizeBatchedForecast(raw,city,[model],3);
forecast.uv=uv;
const reloaded=normalizeForecastPayload(structuredClone(forecast),{cityId:city.id});
assert.equal(reloaded.uv.daily.uvIndexMax[0],7.1,'persisted UV must survive forecast normalization');
const hourly=buildTimelinePoints(reloaded,'HOURLY',new Date('2026-10-11T09:02:00Z'),{hourlyHorizonHours:3});
assert.deepEqual(hourly.map(point=>point.uvIndex),[2.4,6.8,null]);
assert.equal(buildTimelinePoints(reloaded,'DAILY',new Date('2026-10-11T09:00:00Z'))[0].uvIndex,7.1);
const legacy=normalizeForecastPayload({...forecast,uv:undefined});
assert.equal(legacy.uv,null,'older caches must not be invalidated');
assert.equal(buildTimelinePoints(legacy,'HOURLY',new Date('2026-10-11T09:00:00Z'))[0].uvIndex,null);

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../styles.css',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../../../js/api.js',import.meta.url),'utf8');
assert.match(api,/hourly','uv_index'/);
assert.match(api,/daily','uv_index_max'/);
assert.match(api,/getUvForecastCached\(city,maxDays,previousForecast,fetchUvForecast\)/);
assert.match(app,/renderUvGauge\(uvMaxForDate\(f,today\)\)/);
assert.match(app,/renderTodayUvCard\(uvMaxForDate\(f,agg\.date\)\)/);
assert.match(app,/timeline-uv">\$\{renderUvInline\(p\.uvIndex\)\}/);
assert.match(app,/\$\{renderUvInline\(point\.uvIndex\)\}/);
assert.match(css,/\.uv-gauge-track/);
assert.match(app,/const uvTargets=points\.map\(\(point,index\)=>`<span class="graphic-uv-slot"/);
assert.match(app,/class="graphic-uv-strip" aria-label=[^`]*\$\{uvTargets\}/);
const weatherTargets=app.slice(app.indexOf('const tempTargets='),app.indexOf('const pressureTargets='));
assert.doesNotMatch(weatherTargets,/renderUvInline\(point\.uvIndex\)/,'UV must no longer follow the condition icon');
assert.match(app,/class="graphic-plot graphic-plot-temperature"><div class="graphic-temp-data">/);
assert.match(css,/\.graphic-temp-data \{ position:absolute; inset:30px 0 0/);
assert.match(css,/\.graphic-sticky-axis-slot:first-child \.graphic-y-axis\.temp \{ top:30px/);
assert.match(css,/\.graphic-uv-strip \{/);
assert.match(css,/\.detail-chrono-axis-hour \.uv-inline > strong \{[^}]*color:inherit/);
console.log('UV best-match ingestion, cache normalization, timeline values and four UI views: OK');
