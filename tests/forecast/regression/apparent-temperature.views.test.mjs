import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderCityComparison, renderTargetedModelComparison } from '../../../js/features/comparison.js';
import { normalizeBatchedForecast } from '../../../js/data/forecast-normalizer.js';
import { aggregateDay } from '../../../js/domain.js';
import { getModel } from '../../../js/models.js';
const read=name=>readFileSync(new URL(`../../../${name}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css');
const endDate=new Date();endDate.setUTCDate(endDate.getUTCDate()+1);endDate.setUTCHours(0,0,0,0);
const dates=Array.from({length:7},(_,i)=>new Date(endDate.getTime()+i*86_400_000).toISOString().slice(0,10));
const hourly=Array.from({length:48},(_,i)=>new Date(endDate.getTime()+i*3_600_000).toISOString().slice(0,16));
const models=['GFS','ICON_EU'].map(getModel);
function makeForecast(id,index){
  const city={id,name:`Ville ${id}`,timezone:'UTC',latitude:48+index,longitude:2+index};
  const raw={timezone:'UTC',hourly:{time:hourly},daily:{time:dates}};
  for(const [modelIndex,model] of models.entries()){
    const key=model.apiKey;
    Object.assign(raw.hourly,{
      [`temperature_2m_${key}`]:hourly.map((_,i)=>20+index+modelIndex+i*.02),
      [`apparent_temperature_${key}`]:hourly.map((_,i)=>15+index+modelIndex+i*.02),
      [`precipitation_${key}`]:hourly.map(()=>0),
      [`wind_speed_10m_${key}`]:hourly.map(()=>7),
      [`cloud_cover_${key}`]:hourly.map(()=>10),
      [`weather_code_${key}`]:hourly.map(()=>0),
    });
    Object.assign(raw.daily,{
      [`temperature_2m_max_${key}`]:dates.map((_,i)=>25+i*.25+index+modelIndex),
      [`temperature_2m_min_${key}`]:dates.map((_,i)=>14+i*.25+index+modelIndex),
      [`apparent_temperature_max_${key}`]:dates.map((_,i)=>20+i*.25+index+modelIndex),
      [`apparent_temperature_min_${key}`]:dates.map((_,i)=>10+i*.25+index+modelIndex),
    });
  }
  return normalizeBatchedForecast(raw,city,models,48);
}
const f1=makeForecast('a',0),f2=makeForecast('b',1);
const ctx={
  t:(key)=>key,locale:'fr',state:{cities:[f1.city,f2.city],forecasts:{a:f1,b:f2}},
  cachedAggregateDay:aggregateDay,unitSystem:'METRIC',
  esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),
  attr:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;'),
  fmt:(v,precision=0)=>Number(v).toFixed(precision),dateLabel:s=>String(s),timeLabel:s=>String(s),
  visibleModelIds:()=>models.map(m=>m.id),selectedModelIds:models.map(m=>m.id),targetCompareOpen:true,
};
for(const unit of ['METRIC','IMPERIAL']){
  ctx.unitSystem=unit;
  const cities=renderCityComparison({ids:['a','b']},ctx);
  assert.ok(cities.includes('city-compare-chart'));
  assert.equal((cities.match(/class="compare-line apparent-temp-line"/g)||[]).length,2,'two city felt curves');
  assert.ok(cities.includes('apparentTemperature'));
  for(const mode of ['HOURLY','DAILY']){
    const modelHtml=renderTargetedModelComparison(f1,'TEMPERATURE',mode,ctx);
    assert.equal((modelHtml.match(/class="compare-line apparent-temp-line"/g)||[]).length,2,`${mode} model felt curves`);
    assert.ok(modelHtml.includes('apparentTemperature'));
  }
  const precipitation=renderTargetedModelComparison(f1,'PRECIPITATION','DAILY',ctx);
  assert.doesNotMatch(precipitation,/compare-line apparent-temp-line/,'non-temperature charts unchanged');
}
const old=structuredClone(f1);
for(const data of Object.values(old.seriesByModel)){
  delete data.hourly.apparentTemperature;
  delete data.daily.apparentTempMax;
  delete data.daily.apparentTempMin;
}
assert.doesNotMatch(renderTargetedModelComparison(old,'TEMPERATURE','DAILY',ctx),/compare-line apparent-temp-line/,'old caches render safely');
// UI coverage; all visualisations keep using existing series and ruler/tooltip event handlers.
for(const name of ['home-apparent-temperature-line','detail-chrono-apparent-line','graphic-apparent-temp-line','timeline-apparent-value','apparent-table-value','data-graphic-ruler-apparent'])assert.ok(app.includes(name),`view marker ${name}`);
for(const name of ['graphic-apparent-temp-line','home-apparent-temperature-line','apparent-temp-line'])assert.ok(css.includes(name),`styles ${name}`);
assert.match(css,/\.compare-line\.apparent-temp-line\s*\{[^}]*pointer-events:\s*none/s);
const locals=['fr','en','es','de','it'];
for(const lang of locals){const content=read(`js/locales/${lang}.js`);for(const key of ['apparentTemperature','apparentTemperatureMin','apparentTemperatureMax'])assert.ok(content.includes(key),`${lang} translation ${key}`);}
console.log('Felt temperature all views, city/model comparisons, themes, units and cache fallback: OK');
