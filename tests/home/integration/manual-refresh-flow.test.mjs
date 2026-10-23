import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MANUAL_REFRESH_COOLDOWN_MS, forecastFreshForInterval, forecastRecentlyUpdated, forecastRefreshVerified } from '../../../js/core/app-state.js';
import { hasTranslation } from '../../../js/i18n.js';

const app=fs.readFileSync(new URL('../../../js/app.js',import.meta.url),'utf8');
const section=app.slice(app.indexOf('async function refreshAll(force=false'),app.indexOf('\nfunction humanError(err)'));
assert.match(app,/if\(target\.dataset\.refreshCity\)[\s\S]*refreshCityWithToast\(target\.dataset\.refreshCity\)/);
assert.match(app,/else if\(action==='refresh-all'\)[^\n]*refreshAll\(true,true,MANUAL_REFRESH_COOLDOWN_MS\)/);
assert.match(app,/else if\(shouldApplyHydratedForecast\(state\.forecasts\[city\.id\],f\)\)/,'hydration race must be prevented in app startup');
assert.doesNotMatch(section,/setTimeout|setInterval|fetch\(/,'the refresh controller must not create timers or separate requests');

const city={id:'paris',name:'Paris',timezone:'Europe/Paris'};
const previous={city,requestedModelIds:['GFS'],fetchedAt:new Date(Date.now()-110*60_000).toISOString(),seriesByModel:{GFS:{}}};
const state={cities:[city],forecasts:{paris:previous},errors:{},loading:new Set(),evolution:{},online:true,settings:{enabledModelIds:['GFS']},route:{name:'home'},errorCenter:{report(){},resolve(){}}};
const toasts=[],tracked=[];
let fetches=0,renders=0,fail=false,request=null,saveFails=false;
const registry=new Map();
const ctx={
  state, MANUAL_REFRESH_COOLDOWN_MS,forecastRecentlyUpdated,forecastRefreshVerified,
  isForecastFresh(f){return forecastFreshForInterval(f,state.settings.enabledModelIds,60);},
  favoriteCities(){return state.cities;},routeShowsWeatherActivity(){return true;},
  i18n(){return {t:(key)=>key};},
  toast(message,args){toasts.push({message,args});return args?.id||'test-toast';},
  render(){renders++;},
  cityRefreshTokens:{begin(id){const token=Symbol();registry.set(id,token);return token;},get:id=>registry.get(id),delete:id=>registry.delete(id)},
  async fetchForecast(city,models,days,cached){
    fetches++;
    if(request)return request;
    if(fail)throw Error('Connection failed');
    return {...cached,city,requestedModelIds:[...models],fetchedAt:new Date().toISOString()};
  },
  saveForecast:async()=>!saveFails,
  recordEvolutionSnapshot(){return [];},analysisStore:{mark(){}},
  classifyError:()=>({message:'Network failure'}),errorDescriptorMessage:()=> 'Network failure',
  trackAnalyticsEvent:(event,route,meta)=>{tracked.push(meta);return Promise.resolve();},
  scheduleIdle(){},persistFavoriteCities(){},ensureNormals(){},refreshVigilanceData(){},
};
vm.runInNewContext(`${section}\nthis.handlers={refreshAll,refreshCity,refreshCityWithToast};`,ctx);
const {refreshAll,refreshCity,refreshCityWithToast}=ctx.handlers;

// A 1h50-old forecast must produce one request and a new timestamp.
await refreshCityWithToast('paris');
assert.equal(fetches,1);
assert.ok(Date.now()-Date.parse(state.forecasts.paris.fetchedAt)<1500,'real success must update the visible fetchedAt field');
assert.equal(toasts.at(-1).message,'weatherRefreshCityComplete');
assert.equal(tracked.length,1);

// A second click must not request, trigger a refresh render, or claim success.
const beforeRenders=renders;
await refreshCityWithToast('paris');
assert.equal(fetches,1);
assert.equal(renders,beforeRenders);
assert.equal(toasts.at(-1).message,'weatherRefreshCityAlreadyCurrent');
assert.equal(tracked.length,1);
await refreshAll(true,true,MANUAL_REFRESH_COOLDOWN_MS);
assert.equal(fetches,1,'refresh-all must share the cooldown across the same forecast');
assert.equal(toasts.at(-1).message,'weatherRefreshAllAlreadyCurrent');
assert.equal(renders,beforeRenders,'all-cities recent click must not rerender');
assert.equal(tracked.length,1,'no fake refresh telemetry on a cache hit');

// After the five-minute limit a manual refresh is allowed even within the 1h auto interval.
state.forecasts.paris={...state.forecasts.paris,fetchedAt:new Date(Date.now()-301_000).toISOString()};
await refreshCityWithToast('paris');
assert.equal(fetches,2);
assert.equal(toasts.at(-1).message,'weatherRefreshCityComplete');

// Changing models must bypass the cooldown immediately (to update the requested series).
state.settings.enabledModelIds=['ECMWF'];
await refreshAll(true,true,MANUAL_REFRESH_COOLDOWN_MS);
assert.equal(fetches,3);
assert.deepEqual(Array.from(state.forecasts.paris.requestedModelIds),['ECMWF']);
assert.equal(toasts.at(-1).message,'weatherRefreshAllComplete');

// In-progress operations must never be reported as freshly completed by a second click.
let resolveRequest;
request=new Promise(resolve=>{resolveRequest=resolve;});
state.forecasts.paris={...state.forecasts.paris,fetchedAt:new Date(Date.now()-110*60_000).toISOString()};
const ongoing=refreshCity('paris',true);
assert.equal(fetches,4);
const rendersBeforeBusy=renders;
await refreshCityWithToast('paris');
assert.equal(fetches,4);
assert.equal(renders,rendersBeforeBusy);
assert.equal(toasts.at(-1).message,'weatherRefreshCityAlreadyRunning');
resolveRequest({...state.forecasts.paris,fetchedAt:new Date().toISOString()});
await ongoing;
request=null;

// A failed call must preserve the old timestamp and show failure, not success.
state.forecasts.paris={...state.forecasts.paris,fetchedAt:new Date(Date.now()-110*60_000).toISOString()};
const oldStamp=state.forecasts.paris.fetchedAt;
fail=true;
await refreshCityWithToast('paris');
assert.equal(fetches,5);
assert.equal(state.forecasts.paris.fetchedAt,oldStamp);
assert.equal(toasts.at(-1).message,'weatherRefreshCityFailed');
assert.equal(toasts.at(-1).args.type,'error');

// Retry a failed request even if the previous successful timestamp would be recent.
fail=false;
state.forecasts.paris={...state.forecasts.paris,fetchedAt:new Date().toISOString()};
await refreshCityWithToast('paris');
assert.equal(fetches,6,'an explicit retry after failure must not be blocked by cooldown');
assert.equal(toasts.at(-1).message,'weatherRefreshCityComplete');

// Offline with cache must not report success and must make no external request.
state.online=false;
state.forecasts.paris={...state.forecasts.paris,fetchedAt:new Date(Date.now()-110*60_000).toISOString()};
await refreshCityWithToast('paris');
assert.equal(fetches,6);
assert.equal(toasts.at(-1).message,'weatherRefreshCityOffline');
assert.equal(toasts.at(-1).args.type,'warning');

// Home global refresh with two cities: only the overdue city may be fetched.
state.online=true;
state.settings.enabledModelIds=['ECMWF'];
const lyon={id:'lyon',name:'Lyon',timezone:'Europe/Paris'};
state.cities.push(lyon);
state.forecasts.paris={...state.forecasts.paris,fetchedAt:new Date().toISOString(),requestedModelIds:['ECMWF']};
state.forecasts.lyon={...state.forecasts.paris,city:lyon,fetchedAt:new Date(Date.now()-131*60_000).toISOString()};
const parisTimestamp=state.forecasts.paris.fetchedAt, beforeMixed=fetches;
await refreshAll(true,true,MANUAL_REFRESH_COOLDOWN_MS);
assert.equal(fetches,beforeMixed+1,'Home must refresh only the overdue city');
assert.equal(state.forecasts.paris.fetchedAt,parisTimestamp,'Home must not overwrite recently updated cities');
assert.ok(Date.now()-Date.parse(state.forecasts.lyon.fetchedAt)<1500,'overdue city must receive a fresh timestamp');
assert.equal(toasts.at(-1).message,'weatherRefreshAllMixed');
const rendersBeforeBothRecent=renders,requestsBeforeBothRecent=fetches;
await refreshAll(true,true,MANUAL_REFRESH_COOLDOWN_MS);
assert.equal(fetches,requestsBeforeBothRecent,'repeated Home refresh must cause zero requests');
assert.equal(renders,rendersBeforeBothRecent,'repeated Home refresh must not trigger an unnecessary render');
assert.equal(toasts.at(-1).message,'weatherRefreshAllAlreadyCurrent');

// A fulfilled request with an old timestamp is NOT a successful refresh.
const requestsBeforeUnverified=fetches;
const oldLyon=state.forecasts.lyon;
state.forecasts.lyon={...oldLyon,fetchedAt:new Date(Date.now()-147*60_000).toISOString()};
const staleLyon=state.forecasts.lyon;
request=Promise.resolve({...staleLyon,fetchedAt:staleLyon.fetchedAt});
await refreshCityWithToast('lyon');
assert.equal(fetches,requestsBeforeUnverified+1,'one request is permitted for old data');
assert.equal(state.forecasts.lyon,staleLyon,'invalid network result must never replace cached data');
assert.equal(toasts.at(-1).message,'weatherRefreshCityUnverified');
assert.equal(toasts.at(-1).args.type,'warning','success toast must not appear after stale response');
request=null;

// A response timestamped NOW but for the wrong model set is likewise unverified.
const modelsBefore=state.forecasts.lyon;
request=Promise.resolve({...modelsBefore,fetchedAt:new Date().toISOString(),requestedModelIds:['GFS']});
await refreshCityWithToast('lyon');
assert.equal(state.forecasts.lyon,modelsBefore);
assert.equal(toasts.at(-1).message,'weatherRefreshCityUnverified');
request=null;

// Successful HTTP response but failed IndexedDB/localStorage write must not show success.
saveFails=true;
await refreshCityWithToast('lyon');
assert.equal(toasts.at(-1).message,'weatherRefreshCityNotSaved');
assert.equal(toasts.at(-1).args.type,'warning');
assert.ok(Date.now()-Date.parse(state.forecasts.lyon.fetchedAt)<1500,'forecast is still updated in memory');
saveFails=false;

// A global refresh that updates one city but receives old data for another
// must produce a warning rather than a global all-success toast.
state.forecasts.paris={...state.forecasts.paris,fetchedAt:new Date(Date.now()-148*60_000).toISOString()};
state.forecasts.lyon={...state.forecasts.lyon,fetchedAt:new Date(Date.now()-148*60_000).toISOString()};
const lyonOldStamp=state.forecasts.lyon.fetchedAt;
request=null;
const mixedBase=ctx.fetchForecast;
ctx.fetchForecast=async(city,models,days,cached)=>{
  fetches++;
  return {...cached,city,requestedModelIds:[...models],fetchedAt:city.id==='lyon'?cached.fetchedAt:new Date().toISOString()};
};
await refreshAll(true,true,MANUAL_REFRESH_COOLDOWN_MS);
assert.equal(toasts.at(-1).message,'weatherRefreshPartial');
assert.equal(toasts.at(-1).args.type,'warning');
assert.equal(state.forecasts.lyon.fetchedAt,lyonOldStamp,'unverified city must retain its old cache');
ctx.fetchForecast=mixedBase;

for(const lang of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']){
  for(const key of ['weatherRefreshAllMixed','weatherRefreshAllAlreadyCurrent','weatherRefreshAlreadyRunning','weatherRefreshCityAlreadyCurrent','weatherRefreshCityAlreadyRunning','weatherRefreshCityOffline','weatherRefreshCityUnverified','weatherRefreshCityNotSaved','weatherRefreshUnverifiedReason','weatherRefreshNotSavedReason'])
    assert.equal(hasTranslation(lang,key),true,`${lang}: ${key}`);
}
console.log('Manual refresh flow: timestamp, cooldown, request count, concurrency, model changes, failures, offline and translations: OK');
