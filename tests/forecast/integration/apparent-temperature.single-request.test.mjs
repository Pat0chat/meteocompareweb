import assert from 'node:assert/strict';
import { fetchForecast } from '../../../js/api.js';
import { resetApiUsage } from '../../../js/api-budget.js';
import { buildTimelinePoints, currentConditions, aggregateDay } from '../../../js/domain.js';
import { getModel } from '../../../js/models.js';

const model=getModel('GFS');
const city={id:'apparent-http',name:'Test',latitude:48.8566,longitude:2.3522,timezone:'UTC'};
const start=new Date();start.setUTCMinutes(0,0,0);
const times=Array.from({length:24},(_,i)=>new Date(start.getTime()+i*3600_000).toISOString().slice(0,16));
const date=times[0].slice(0,10);
const raw={timezone:'UTC',hourly:{time:times,temperature_2m:Array(24).fill(20),apparent_temperature:Array(24).fill(17),precipitation:Array(24).fill(0),wind_speed_10m:Array(24).fill(12),cloud_cover:Array(24).fill(10),weather_code:Array(24).fill(1)},daily:{time:[date],temperature_2m_max:[21],temperature_2m_min:[16],apparent_temperature_max:[18],apparent_temperature_min:[13]}};
const requests=[];
const previousFetch=globalThis.fetch;
globalThis.fetch=async url=>{
  const requested=new URL(String(url));requests.push(requested);
  const payload=requested.searchParams.get('hourly')==='uv_index'?{hourly:{time:times,uv_index:Array(24).fill(1)},daily:{time:[date],uv_index_max:[1]}}:raw;
  return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
};
try{
  resetApiUsage();
  const forecast=await fetchForecast(city,[model.id],1);
  const weatherRequests=requests.filter(url=>url.searchParams.has('models'));
  const uvRequests=requests.filter(url=>url.searchParams.get('hourly')==='uv_index');
  assert.equal(weatherRequests.length,1,'feels-like uses the existing single batched forecast call');
  assert.equal(uvRequests.length,1,'unrelated UV request count remains unchanged');
  const url=weatherRequests[0];
  for(const field of ['temperature_2m','apparent_temperature'])assert.ok(url.searchParams.get('hourly').split(',').includes(field));
  for(const field of ['temperature_2m_max','temperature_2m_min','apparent_temperature_max','apparent_temperature_min'])assert.ok(url.searchParams.get('daily').split(',').includes(field));
  assert.equal(forecast.seriesByModel[model.id].hourly.apparentTemperature[0],17);
  const count=requests.length;
  for(let i=0;i<4;i++){
    const now=new Date(start.getTime()+9*60_000);
    assert.ok(Number.isFinite(currentConditions(forecast,now).apparentTemperature));
    assert.ok(Number.isFinite(aggregateDay(forecast,date).apparentTempMax));
    assert.ok(Number.isFinite(buildTimelinePoints(forecast,'HOURLY',now)[0].apparentTemperatureC));
  }
  assert.equal(requests.length,count,'changing views / recomputing displays cannot fetch or refresh weather');
  // Missing new fields must not cause recovery calls (legacy/incomplete optional data).
  requests.length=0;
  const legacy={...raw,hourly:{...raw.hourly},daily:{...raw.daily}};
  delete legacy.hourly.apparent_temperature;
  delete legacy.daily.apparent_temperature_max;
  delete legacy.daily.apparent_temperature_min;
  globalThis.fetch=async url=>{requests.push(new URL(String(url)));return new Response(JSON.stringify(new URL(String(url)).searchParams.get('hourly')==='uv_index'?{hourly:{time:times,uv_index:Array(24).fill(0)},daily:{time:[date],uv_index_max:[0]}}:legacy),{status:200,headers:{'content-type':'application/json'}});};
  const other=await fetchForecast({...city,id:'apparent-legacy-api'},[model.id],1);
  assert.equal(requests.filter(url=>url.searchParams.has('models')).length,1,'missing optional value must not start a model recovery request');
  assert.equal(other.seriesByModel.GFS.hourly.apparentTemperature[0],null);
}finally{globalThis.fetch=previousFetch;}
console.log('Apparent temperature request budget, no refresh from views, missing-data fallback: OK');
