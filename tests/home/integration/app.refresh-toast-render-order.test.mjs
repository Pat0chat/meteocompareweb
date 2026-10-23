import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {MANUAL_REFRESH_COOLDOWN_MS, forecastFreshForInterval, forecastRecentlyUpdated, forecastRefreshVerified} from '../../../js/core/app-state.js';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const handlersSource=app.slice(app.indexOf('async function refreshAll(force=false'),app.indexOf('\nfunction humanError(err)'));
assert.match(handlersSource,/render\(\{immediate:true\}\);completedRender=true/,'Home refresh must flush its render before the success toast');
assert.match(handlersSource,/includes\(status\)\)render\(\{immediate:true\}\)/,'city refresh must flush its render before the success toast');
assert.doesNotMatch(handlersSource,/setTimeout|setInterval|\bfetch\(/,'the confirmation must add no timers or new HTTP calls');

const city={id:'paris',name:'Paris',timezone:'Europe/Paris'};
const old={city,requestedModelIds:['GFS'],fetchedAt:new Date(Date.now()-30*60_000).toISOString(),seriesByModel:{GFS:{}}};
const state={cities:[city],forecasts:{paris:old},errors:{},loading:new Set(),evolution:{},online:true,
  settings:{enabledModelIds:['GFS']},route:{name:'home'},errorCenter:{report(){},resolve(){}}};
const tokens=new Map(),toasts=[];
let fetches=0,renders=0,visibleSync=old.fetchedAt;
const ctx={state,MANUAL_REFRESH_COOLDOWN_MS,forecastRecentlyUpdated,forecastRefreshVerified,
  favoriteCities:()=>state.cities,routeShowsWeatherActivity:()=>true,
  isForecastFresh:f=>forecastFreshForInterval(f,state.settings.enabledModelIds,60),
  i18n:()=>({t:key=>key}),
  toast(message,options){toasts.push({message,options,visibleSync});return options?.id||'toast';},
  render(options){renders++;if(options?.immediate)visibleSync=state.forecasts.paris?.fetchedAt;},
  cityRefreshTokens:{begin(id){const token=Symbol();tokens.set(id,token);return token;},get:id=>tokens.get(id),delete:id=>tokens.delete(id)},
  async fetchForecast(c,ids,_days,cached){fetches++;return {...cached,city:c,requestedModelIds:[...ids],fetchedAt:new Date().toISOString()};},
  saveForecast:async()=>true,recordEvolutionSnapshot:()=>[],analysisStore:{mark(){}},
  classifyError:()=>({message:'failed'}),errorDescriptorMessage:()=> 'failed',
  trackAnalyticsEvent:()=>Promise.resolve(),scheduleIdle(){},persistFavoriteCities(){},ensureNormals(){},refreshVigilanceData(){},
};
vm.runInNewContext(`${handlersSource}\nthis.handlers={refreshAll,refreshCityWithToast};`,ctx);

await ctx.handlers.refreshAll(true,true,MANUAL_REFRESH_COOLDOWN_MS);
let confirmed=toasts.at(-1);
assert.equal(confirmed.message,'weatherRefreshAllComplete');
assert.ok(Date.now()-Date.parse(confirmed.visibleSync)<2000,'Hero must show a recent timestamp BEFORE showing global success');
assert.equal(fetches,1,'only one API call for the overdue Home city');

const beforeRenders=renders;
await ctx.handlers.refreshAll(true,true,MANUAL_REFRESH_COOLDOWN_MS);
assert.equal(fetches,1,'second click within five minutes must not send a request');
assert.equal(renders,beforeRenders,'second click within five minutes must not rerender the Home');
assert.equal(toasts.at(-1).message,'weatherRefreshAllAlreadyCurrent');

state.forecasts.paris={...state.forecasts.paris,fetchedAt:new Date(Date.now()-30*60_000).toISOString()};
visibleSync=state.forecasts.paris.fetchedAt;
await ctx.handlers.refreshCityWithToast('paris');
confirmed=toasts.at(-1);
assert.equal(confirmed.message,'weatherRefreshCityComplete');
assert.ok(Date.now()-Date.parse(confirmed.visibleSync)<2000,'City toast must follow the freshly installed view');
assert.equal(fetches,2);
console.log('Home/Details toast ordering, 30-minute refresh, render and cooldown regression: OK');
