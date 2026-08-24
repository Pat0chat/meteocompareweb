import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hourlySeriesHealth, normalizeBatchedForecast } from '../../../js/api.js';
import { aggregateDay } from '../../../js/domain.js';
import { getModel } from '../../../js/models.js';

const city={id:'paris',name:'Paris',latitude:48.8566,longitude:2.3522,timezone:'Europe/Paris'};
for(const id of ['AROME_FRANCE_HD','AROME_FRANCE','ICON_D2']){
  const m=getModel(id),health=hourlySeriesHealth({hourly:{temperature2m:Array(18).fill(12),precipitation:Array(18).fill(0),windSpeed10m:Array(18).fill(15)}},m,48);
  assert.equal(health.degraded,false,`${id}: a balanced short tail must not be labelled partial`);
  assert.equal(health.shortRegional,true);
}
const d2=getModel('ICON_D2'),broken=hourlySeriesHealth({hourly:{temperature2m:Array(18).fill(12),precipitation:[...Array(3).fill(0),...Array(15).fill(null)],windSpeed10m:Array(18).fill(15)}},d2,48);
assert.equal(broken.degraded,true,'a genuinely truncated critical variable must still be detected');

const time=Array.from({length:48},(_,i)=>new Date(Date.parse('2026-08-18T00:00:00Z')+i*3600e3).toISOString().slice(0,16));
const limit=(n,fn)=>Array.from({length:48},(_,i)=>i<n?fn(i):null);
const raw={timezone:'Europe/Paris',hourly:{time,temperature_2m:limit(30,i=>15+i/10),precipitation:limit(30,()=>0),wind_speed_10m:limit(30,()=>12),weather_code:limit(30,()=>1)},daily:{time:['2026-08-18','2026-08-19'],temperature_2m_max:[26,29],temperature_2m_min:[15,16],precipitation_sum:[0,3],wind_speed_10m_max:[18,24],wind_gusts_10m_max:[30,36],wind_direction_10m_dominant:[180,190],weather_code:[1,2],sunrise:['2026-08-18T06:30','2026-08-19T06:31'],sunset:['2026-08-18T20:55','2026-08-19T20:53']}};
const forecast=normalizeBatchedForecast(raw,city,[getModel('AROME_FRANCE')],48),series=forecast.seriesByModel.AROME_FRANCE;
assert.equal(series.daily.tempMax[1],29,'partial terminal-day value must remain visible');
assert.equal(series.daily.completeness.temperature[1].status,'PARTIAL');
assert.equal(series.daily.completeness.temperature[1].availableHours,6);
assert.equal(aggregateDay(forecast,'2026-08-19').tempMax,null,'partial terminal day must not enter daily agreement/summary');

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
assert.match(app,/updateSettingsChoiceButtons\('data-theme'/,'theme changes should update controls without a full Settings rerender');
assert.match(app,/refreshSettingsHistoryRows\(\)/,'model selection should update only the affected Settings content');
assert.match(app,/routeShowsWeatherActivity\(\)/,'background weather refreshes should avoid repainting non-weather pages such as Settings');
assert.match(app,/stabilizeLocalScroll/,'rerendering Settings controls must have deterministic scroll stabilization');
console.log('MeteoCompare Web Settings + short-model horizon tests: OK');
